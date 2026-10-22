import test from 'node:test';
import assert from 'node:assert/strict';
import { submissionMessage } from '../shared/submission-feedback.js';

const rejected = description => ({ ok: false, status: 401,
  body: { error: 'invalid_client', error_description: description } });

test('invalid_client distinguishes an unknown tenancy from an invalid client ID', () => {
  const tenancy = submissionMessage(rejected('Helsenorge-CorrelationId: fixture DebugEnvironmentInfo: 118013 - FromThirdPartyAccessTokenToSystemWsSyncInternalV1: client tenancy is unknown..'));
  assert.match(tenancy, /klienttypen/);
  assert.doesNotMatch(tenancy, /klient-ID/);
  const id = submissionMessage(rejected('DebugEnvironmentInfo: fixture - clientid is not valid..'));
  assert.match(id, /klient-ID/);
  assert.doesNotMatch(id, /klienttypen/);
});

test('unknown or malformed invalid_client diagnostics do not invent a client ID cause or expose upstream details', () => {
  for (const description of ['fixture-secret-diagnostic', '', null, {}, ['clientid is not valid'], undefined]) {
    const message = submissionMessage(rejected(description));
    assert.match(message, /klientopplysningene/);
    assert.doesNotMatch(message, /fixture-secret|klient-ID-en|klienttypen/);
  }
});

test('submission messages preserve success, unknown delivery and other rejection statuses', () => {
  assert.match(submissionMessage({ ok: true, status: 201 }), /mottatt/);
  assert.match(submissionMessage({ ...rejected('clientid is not valid'), deliveryUnknown: true }), /Leveringsstatus er ukjent/);
  for (const body of [null, 'raw response', { error: 'other' }]) {
    assert.equal(submissionMessage({ ok: false, status: 401, body }), 'Helsenorge avviste forespørselen (HTTP 401). Se responsen.');
  }
  assert.match(submissionMessage({ ...rejected('client tenancy is unknown'), status: 403 }), /HTTP 403/);
});
