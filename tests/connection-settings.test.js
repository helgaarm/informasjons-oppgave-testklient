import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { createConnectionSettings } from '../server/connection-settings.js';
import { configuration } from '../server/helseid.js';
import { createHelseIdClient } from '../server/auth.js';
import { createApp } from '../server/app.js';
import { exampleTask } from '../shared/task.js';

const fixture = () => ({ apiKey: 'fixture-key-not-real', audience: 'fixture:audience', scope: 'fixture:scope', parent: '999999999', child: '' });
const noNetwork = () => assert.fail('Saving settings must not call an external service');
const clientFactory = config => createHelseIdClient(config, noNetwork);

async function localSettings(t, initial = configuration({})) {
  const prefix = path.resolve(tmpdir(), 'nhn-connection-test-');
  const root = await mkdtemp(prefix);
  t.after(async () => {
    assert.ok(path.resolve(root).startsWith(prefix));
    await rm(root, { recursive: true, force: true });
  });
  const options = { directory: path.join(root, 'secrets'), initial, clientFactory };
  return { root, options, settings: await createConnectionSettings(options) };
}

async function serve(t, options) {
  let app;
  const server = http.createServer((req, res) => app(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  app = createApp({ ...options, origin: url });
  const response = await fetch(`${url}/api/config`);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const config = await response.json();
  const post = (route, body, headers = {}) => fetch(`${url}${route}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': config.csrf, Origin: url, ...headers }, body: JSON.stringify(body) });
  const get = () => fetch(`${url}/api/config`, { headers: { Cookie: cookie } });
  return { post, get, config };
}

test('settings persist across restarts, preserve a blank key, rotate keys and leave .env untouched', async t => {
  const s = await localSettings(t);
  const envFile = path.join(s.root, '.env');
  await writeFile(envFile, 'HOST=127.0.0.1\nCUSTOM=preserve-me\n');
  assert.equal(s.settings.client.status().configured, false);
  const client = await s.settings.save(fixture());
  assert.equal(client.status().configured, true);
  assert.equal(client.status().authenticated, false);
  assert.ok(!JSON.stringify(client.status()).includes(fixture().apiKey));
  const restarted = await createConnectionSettings(s.options);
  assert.equal(restarted.client.config.apiKey, fixture().apiKey);
  restarted.client.token = { value: 'fixture-old-token', expiresAt: Date.now() + 300000 };
  const retained = await restarted.save({ ...fixture(), apiKey: '', scope: 'fixture:updated', child: '888888888' });
  assert.equal(retained.config.apiKey, fixture().apiKey);
  assert.equal(retained.status().scope, 'fixture:updated');
  assert.equal(retained.status().child, '888888888');
  assert.equal(retained.status().authenticated, false);
  const rotated = await restarted.save({ ...fixture(), apiKey: 'fixture-replacement' });
  assert.equal(rotated.config.apiKey, 'fixture-replacement');
  assert.deepEqual(await readdir(s.options.directory), ['connection.json']);
  assert.equal(await readFile(envFile, 'utf8'), 'HOST=127.0.0.1\nCUSTOM=preserve-me\n');
});

test('validation rejects incomplete values, invalid organizations, control characters and unknown fields without writing', async t => {
  const s = await localSettings(t);
  for (const input of [null, [], { ...fixture(), endpoint: 'https://untrusted.example' },
    { ...fixture(), apiKey: '' }, { ...fixture(), apiKey: 'secret\nwith-newline' },
    { ...fixture(), audience: ' ' }, { ...fixture(), audience: 'x'.repeat(513) },
    { ...fixture(), scope: 123 }, { ...fixture(), parent: '123' }, { ...fixture(), child: 'abc' }]) {
    await assert.rejects(s.settings.save(input), error => error.code === 'invalid_settings' && error.status === 400);
  }
  await assert.rejects(readFile(path.join(s.options.directory, 'connection.json')), { code: 'ENOENT' });
  const valid = await s.settings.save({ ...fixture(), scope: ' fixture:scope fixture:other ' });
  assert.equal(valid.status().scope, 'fixture:scope fixture:other');
});

test('write failure keeps the old key and cleans temporary files', async t => {
  const s = await localSettings(t, { ...configuration({}), ...fixture() });
  const target = path.join(s.options.directory, 'connection.json');
  await mkdir(target, { recursive: true }); // A directory at the fixed destination prevents rename.
  await assert.rejects(s.settings.save({ ...fixture(), apiKey: 'fixture-not-saved' }), error => error.code === 'settings_write_failed' && !error.message.includes('fixture-not-saved'));
  assert.deepEqual(await readdir(s.options.directory), ['connection.json']);
  await rmdir(target); // Empty directory owned by this test.
  const client = await s.settings.save({ ...fixture(), apiKey: '' });
  assert.equal(client.config.apiKey, fixture().apiKey);
});

test('registered-client mode ignores saved TTT settings; malformed saved settings fail without leaking data', async t => {
  const s = await localSettings(t);
  await s.settings.save(fixture());
  const registered = await createConnectionSettings({ ...s.options, initial: configuration({ HELSEID_AUTH_MODE: 'client_credentials', HELSEID_CLIENT_ID: 'existing-client' }) });
  assert.equal(registered.client.status().mode, 'client_credentials');
  assert.equal(registered.client.status().clientId, 'existing-client');
  await assert.rejects(registered.save(fixture()), error => error.code === 'unsupported_auth_mode');
  await writeFile(path.join(s.options.directory, 'connection.json'), '{"apiKey":"fixture-secret-malformed"');
  await assert.rejects(createConnectionSettings(s.options), error => /ugyldig/.test(error.message) && !error.message.includes('fixture-secret-malformed'));
});

test('settings endpoint requires CSRF and same origin, activates saved settings immediately and never returns the key', async t => {
  const local = await localSettings(t);
  const s = await serve(t, { client: local.settings.client, saveSettings: local.settings.save });
  assert.equal(s.config.auth.editable, true);
  assert.equal((await s.post('/api/auth/settings', fixture(), { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await s.post('/api/auth/settings', fixture(), { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await s.post('/api/auth/settings', fixture(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  let response = await s.post('/api/auth/settings', fixture());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.ok(!body.includes(fixture().apiKey));
  assert.equal(JSON.parse(body).configured, true);
  response = await s.get();
  const current = await response.text();
  assert.ok(!current.includes(fixture().apiKey));
  assert.equal(JSON.parse(current).auth.parent, fixture().parent);
  response = await s.post('/api/auth/settings', { ...fixture(), parent: 'bad' });
  assert.equal(response.status, 400);
  const error = await response.json();
  assert.ok(error.fields.parent);
  assert.ok(!JSON.stringify(error).includes(fixture().apiKey));
  assert.equal((await (await s.get()).json()).auth.configured, true);
});

test('registered-client servers and servers without a settings store cannot save from the browser', async t => {
  const local = await localSettings(t);
  const withoutStore = await serve(t, { client: local.settings.client });
  assert.equal(withoutStore.config.auth.editable, false);
  assert.equal((await withoutStore.post('/api/auth/settings', fixture())).status, 400);
  const registered = await serve(t, { client: clientFactory(configuration({ HELSEID_CLIENT_ID: 'existing' })), saveSettings: () => assert.fail('Must not save') });
  assert.equal(registered.config.auth.editable, false);
  assert.equal((await registered.post('/api/auth/settings', fixture())).status, 400);
});

test('saving blocks concurrent saves, authentication and submission until the new client is ready', async t => {
  const local = await localSettings(t);
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const s = await serve(t, { client: local.settings.client, saveSettings: async input => { started(); await gate; return local.settings.save(input); } });
  const pending = s.post('/api/auth/settings', fixture());
  await entered;
  try {
    assert.equal((await s.post('/api/auth/settings', fixture())).status, 409);
    assert.equal((await s.post('/api/auth/connect', {})).status, 409);
    assert.equal((await s.post('/api/tasks/send', {})).status, 409);
  } finally { release(); }
  assert.equal((await pending).status, 200);
  assert.equal((await s.post('/api/auth/settings', { ...fixture(), apiKey: '' })).status, 200);
});

test('settings cannot change during authentication or submission and become writable when the request finishes', async t => {
  for (const route of ['/api/auth/connect', '/api/tasks/send']) {
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const wait = async () => { started(); await gate; return { ok: true, status: 201 }; };
    const client = { status: () => ({ mode: 'test-token', configured: true }), getToken: wait, sendTask: wait };
    const s = await serve(t, { client, saveSettings: async () => client });
    const task = exampleTask(); task.owner.identifier.value = '12345678901';
    const pending = s.post(route, { task, confirmTestData: true });
    await entered;
    try { assert.equal((await s.post('/api/auth/settings', fixture())).status, 409); }
    finally { release(); }
    assert.equal((await pending).status, 200);
    assert.equal((await s.post('/api/auth/settings', fixture())).status, 200);
  }
});
