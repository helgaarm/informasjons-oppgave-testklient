import test from 'node:test';
import assert from 'node:assert/strict';
import { postJson, requireSubmissionResult, UnconfirmedResponseError } from '../src/api.js';

const config = { csrf: 'synthetic-csrf' };

test('failures before fetch are local errors, not uncertain delivery', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', () => assert.fail('No request should be sent'));
  await assert.rejects(postJson('/api/tasks/send', {}, null), error => !(error instanceof UnconfirmedResponseError));
  const circular = {}; circular.task = circular;
  await assert.rejects(postJson('/api/tasks/send', circular, config), TypeError);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('transport, decoding and non-object responses are unconfirmed without leaking raw details', async t => {
  for (const result of [new TypeError('raw transport details'), '{"ok":true,', '<html>raw gateway response</html>', 'null', '[]', 'true']) {
    t.mock.method(globalThis, 'fetch', async () => {
      if (result instanceof Error) throw result;
      return new Response(result);
    });
    await assert.rejects(postJson('/api/tasks/send', {}, config), error => {
      assert.ok(error instanceof UnconfirmedResponseError);
      assert.equal(error.message, 'Kunne ikke bekrefte svaret fra den lokale serveren.');
      return true;
    });
    t.mock.restoreAll();
  }
});

test('structured local rejections retain validation and integration details', async t => {
  for (const data of [
    { error: 'Validation failed', issues: [{ severity: 'error', path: 'description' }] },
    { error: 'Connection failed', code: 'auth_failed', fields: ['apiKey'] },
    { error: 'Delivery unknown', code: 'delivery_unknown' },
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(data, { status: 422 }));
    await assert.rejects(postJson('/api/tasks/send', {}, config), error => {
      assert.ok(!(error instanceof UnconfirmedResponseError));
      assert.equal(error.message, data.error);
      assert.deepEqual(error.issues, data.issues);
      assert.equal(error.code, data.code);
      assert.deepEqual(error.fields, data.fields);
      return true;
    });
    t.mock.restoreAll();
  }
});

test('submission receipts need a valid outcome, status and matching destination', () => {
  const receipt = { ok: true, status: 201, environment: 'test02' };
  for (const patch of [
    { ok: 'true' }, { ok: undefined }, { status: undefined }, { status: '201' },
    { status: 100 }, { status: 600 }, { status: 201.5 }, { status: 422 },
    { environment: 'test01' }, { environment: undefined }, { deliveryUnknown: true }, { deliveryUnknown: 'false' },
  ]) {
    assert.throws(() => requireSubmissionResult({ ...receipt, ...patch }, 'test02'), UnconfirmedResponseError);
  }
  for (const result of [receipt, { ok: false, status: 422, environment: 'test02' }, { ok: false, status: 504, deliveryUnknown: true, environment: 'test02' }]) {
    assert.equal(requireSubmissionResult(result, 'test02'), result);
  }
});

test('upstream rejections returned through HTTP 502 remain usable receipts', async t => {
  const receipt = { ok: false, status: 422, environment: 'test02', body: { error: 'Synthetic rejection' } };
  t.mock.method(globalThis, 'fetch', async (_path, request) => {
    assert.equal(request.headers['X-CSRF-Token'], config.csrf);
    assert.equal(request.method, 'POST');
    return Response.json(receipt, { status: 502 });
  });
  assert.deepEqual(requireSubmissionResult(await postJson('/api/tasks/send', {}, config), 'test02'), receipt);
});
