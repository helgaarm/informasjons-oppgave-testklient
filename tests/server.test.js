import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { exampleTask } from '../shared/task.js';
import { IntegrationError } from '../server/helseid.js';

async function setup(t, sendTask = async () => ({ ok: true, status: 201, body: { resourceType: 'Task', id: 'created' } })) {
  let calls = 0, app;
  const server = http.createServer((req, res) => app(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ origin: url, client: {
    status: () => ({ configured: true }),
    getToken: async () => ({ value: 'must-not-leak' }),
    sendTask: async (...args) => { calls++; return sendTask(...args); },
  } });
  const configResponse = await fetch(`${url}/api/config`);
  const cookie = configResponse.headers.get('set-cookie').split(';')[0];
  const { csrf } = await configResponse.json();
  const post = (route, body, extra = {}) => fetch(`${url}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf, Origin: url, ...extra }, body: JSON.stringify(body) });
  const task = exampleTask(); task.owner.identifier.value = '12345678901';
  return { post, url, task, cookie, calls: () => calls };
}
test('same-origin and CSRF enforcement; validation never sends; auth does not expose token', async t => {
  const s = await setup(t);
  const schema = await fetch(`${s.url}/api/schema`);
  assert.equal(schema.headers.get('set-cookie'), null); // A parallel schema request cannot replace config's CSRF session.
  let r = await s.post('/api/auth/connect', {}, { 'X-CSRF-Token': '' }); assert.equal(r.status, 403);
  r = await s.post('/api/auth/connect', {}, { Origin: 'https://untrusted.example' }); assert.equal(r.status, 403);
  r = await s.post('/api/auth/connect', {}); assert.equal(r.status, 200); assert.ok(!(await r.text()).includes('must-not-leak'));
  r = await s.post('/api/tasks/validate', { task: s.task }); assert.equal((await r.json()).valid, true);
  r = await s.post('/api/tasks/send', { task: s.task }); assert.equal(r.status, 400);
  r = await s.post('/api/tasks/send', { task: { ...s.task, status: 'completed' }, confirmTestData: true }); assert.equal(r.status, 422);
  assert.equal(s.calls(), 0);
});
test('successful send is not repeated for the same business identifier', async t => {
  let count = 0;
  const s = await setup(t, async task => { count++; return { ok: true, status: 201, body: { id: task.identifier[0].value } }; });
  const body = { task: s.task, confirmTestData: true };
  const r = await s.post('/api/tasks/send', body); assert.equal(r.status, 200); assert.equal((await r.json()).status, 201);
  assert.equal((await s.post('/api/tasks/send', body)).status, 409); assert.equal(count, 1);
});
test('unknown delivery status blocks repeated POSTs', async t => {
  const s = await setup(t, () => { throw new IntegrationError('Unknown', 502, 'delivery_unknown'); });
  const body = { task: s.task, confirmTestData: true };
  assert.equal((await s.post('/api/tasks/send', body)).status, 502);
  assert.equal((await s.post('/api/tasks/send', body)).status, 409);
});
test('upstream rejection is shown and a corrected payload may be sent', async t => {
  const s = await setup(t, async () => ({ ok: false, status: 422, body: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: 'Invalid recipient' }] } }));
  const body = { task: s.task, confirmTestData: true };
  const r = await s.post('/api/tasks/send', body); assert.equal(r.status, 502); assert.equal((await r.json()).body.resourceType, 'OperationOutcome');
  assert.equal((await s.post('/api/tasks/send', body)).status, 502);
});

test('authentication attempts are rate limited independently of session and forwarding headers', async t => {
  const s = await setup(t);
  for (let i = 0; i < 20; i++) {
    const response = await s.post('/api/auth/connect', {});
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const blocked = await s.post('/api/auth/connect', {}, { Cookie: '', 'X-Forwarded-For': '192.0.2.2' });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal(blocked.headers.get('cache-control'), 'no-store');
  assert.ok(!(await blocked.text()).includes('must-not-leak'));
  // Reading the app remains possible while the smaller authentication budget is exhausted.
  assert.equal((await fetch(`${s.url}/api/config`, { headers: { Cookie: s.cookie } })).status, 200);
  assert.equal(s.calls(), 0);
});

test('the global request budget also covers static paths and cannot be reset with a new session', async t => {
  const s = await setup(t); // The initial config request consumes one request.
  for (let i = 1; i < 240; i++) {
    const response = await fetch(`${s.url}/api/config`, { headers: { Cookie: s.cookie } });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const blocked = await fetch(`${s.url}/`, { headers: { 'X-Forwarded-For': '192.0.2.3' } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});
