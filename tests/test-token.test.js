import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SignJWT, calculateJwkThumbprint, generateKeyPair, importJWK, jwtVerify } from 'jose';
import { configuration, HelseIdClient } from '../server/helseid.js';
import { createHelseIdClient } from '../server/auth.js';
import { TestTokenClient, TEST_TOKEN_ENDPOINT } from '../server/test-token.js';
import { ISSUER, TASK_ENDPOINT, exampleTask } from '../shared/task.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const config = () => configuration({ HELSEID_AUTH_MODE: 'test-token', HELSEID_TTT_API_KEY: 'fixture-api-secret',
  HELSEID_TTT_AUDIENCE: 'fixture:audience', HELSEID_SCOPE: 'fixture:scope fixture:second', HELSEID_ORGNR_PARENT: '999999999' });
const issuerKeys = await generateKeyPair('RS256');

async function tokenResponse(request, changes = {}, proofChanges = {}) {
  const privateJwk = JSON.parse(request.dPoPProofParameters.privateKeyForProofCreation);
  const { d, p, q, dp, dq, qi, ...publicJwk } = privateJwk;
  const key = await importJWK(privateJwk, 'PS256');
  const claims = { iss: ISSUER, aud: request.audience, scope: request.clientClaimsParameters.scope,
    exp: Math.floor(Date.now() / 1000) + 300, cnf: { jkt: await calculateJwkThumbprint(publicJwk) },
    'helseid://claims/client/claims/orgnr_parent': request.clientClaimsParameters.orgnrParent, ...changes };
  const accessTokenJwt = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).sign(issuerKeys.privateKey);
  const dPoPProof = await new SignJWT({ htu: TASK_ENDPOINT, htm: 'POST',
    ath: createHash('sha256').update(accessTokenJwt).digest('base64url'), ...proofChanges })
    .setProtectedHeader({ alg: 'PS256', typ: 'dpop+jwt', jwk: publicJwk }).setIssuedAt().setJti('ttt-generated-proof').sign(key);
  return { isError: false, successResponse: { accessTokenJwt, dPoPProof } };
}

test('TTT is the default without a client; existing client setups still work', () => {
  assert.ok(createHelseIdClient(configuration({})) instanceof TestTokenClient);
  assert.ok(createHelseIdClient(configuration({ HELSEID_CLIENT_ID: 'existing' })) instanceof HelseIdClient);
  assert.equal(createHelseIdClient(configuration({ HELSEID_CLIENT_ID: 'existing' })).status().mode, 'client_credentials');
  assert.throws(() => createHelseIdClient(configuration({ HELSEID_AUTH_MODE: 'unknown' })), /HELSEID_AUTH_MODE/);
});

test('TTT requires only API key, audience, scope and test organization, and fails before network calls', async () => {
  const client = createHelseIdClient(configuration({}), () => assert.fail('No network expected'));
  assert.deepEqual(client.status().missing, ['HELSEID_TTT_API_KEY', 'HELSEID_TTT_AUDIENCE', 'HELSEID_SCOPE', 'HELSEID_ORGNR_PARENT']);
  await assert.rejects(client.getToken(), e => e.code === 'not_configured');
  const complete = createHelseIdClient(config());
  assert.equal(complete.status().configured, true);
  const invalid = createHelseIdClient({ ...config(), parent: 'invalid' }, () => assert.fail('No network expected'));
  await assert.rejects(invalid.getToken(), e => e.code === 'invalid_configuration');
});

test('TTT authenticates without registered keys and sends fresh DPoP proofs, including a nonce retry', async () => {
  let tokenCalls = 0; let apiCalls = 0; let response; const proofs = [];
  const client = createHelseIdClient({ ...config(), keyFile: '/must-not-be-read/registered-key.jwk' }, async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url === TEST_TOKEN_ENDPOINT) {
      tokenCalls++;
      assert.equal(options.headers['X-Auth-Key'], 'fixture-api-secret');
      const body = JSON.parse(options.body);
      assert.equal(body.audience, 'fixture:audience');
      assert.equal(body.withoutDefaultClientClaims, true); assert.equal(body.withoutDefaultUserClaims, true);
      assert.equal(body.createDPoPTokenWithDPoPProof, true);
      assert.deepEqual(body.clientClaimsParameters, { scope: ['fixture:scope', 'fixture:second'], orgnrParent: '999999999' });
      assert.equal(body.dPoPProofParameters.htuClaimValue, TASK_ENDPOINT);
      assert.equal(body.dPoPProofParameters.htmClaimValue, 'POST');
      assert.ok(JSON.parse(body.dPoPProofParameters.privateKeyForProofCreation).d);
      assert.equal(body.userClaimsParameters, undefined); assert.equal(body.task, undefined);
      response = await tokenResponse(body);
      return json(response);
    }
    assert.equal(url, TASK_ENDPOINT); apiCalls++;
    assert.equal(options.headers['X-Auth-Key'], undefined);
    assert.equal(options.headers.Authorization, `DPoP ${response.successResponse.accessTokenJwt}`);
    assert.equal(options.headers['Content-Type'], 'application/fhir+json');
    const proof = options.headers.DPoP;
    const verified = await jwtVerify(proof, client.verificationKey, { typ: 'dpop+jwt' });
    assert.equal(verified.protectedHeader.jwk.d, undefined);
    assert.equal(verified.payload.htm, 'POST'); assert.equal(verified.payload.htu, TASK_ENDPOINT);
    assert.equal(verified.payload.ath, createHash('sha256').update(response.successResponse.accessTokenJwt).digest('base64url'));
    assert.notEqual(proof, response.successResponse.dPoPProof); proofs.push(verified.payload.jti);
    assert.equal(JSON.parse(options.body).focus.type, 'Communication');
    if (apiCalls === 1) return json({}, 401, { 'DPoP-Nonce': 'api-nonce', 'WWW-Authenticate': 'DPoP error="use_dpop_nonce"' });
    assert.equal(verified.payload.nonce, 'api-nonce');
    return json({ resourceType: 'Task', id: 'created' }, 201);
  });
  // Connection test and simultaneous callers share a token, never a proof.
  await Promise.all([client.getToken(), client.getToken()]);
  assert.equal(client.status().authenticated, true);
  for (let i = 0; i < 2; i++) assert.equal((await client.sendTask(exampleTask(), `correlation-${i}`)).status, 201);
  assert.equal(tokenCalls, 1); assert.equal(apiCalls, 3); assert.equal(new Set(proofs).size, 3);
  const status = JSON.stringify(client.status());
  assert.ok(!status.includes('fixture-api-secret'));
  assert.ok(!status.includes(response.successResponse.accessTokenJwt));
  assert.ok(!status.includes(client.testKeyJwk.d));
});

test('TTT rejects mismatched token claims and proofs before sending any Task', async () => {
  const invalidCases = [
    [{ cnf: { jkt: 'unrelated-key' } }, {}], [{ aud: 'wrong:api' }, {}],
    [{ iss: 'https://untrusted.example' }, {}], [{ scope: ['wrong:scope'] }, {}],
    [{ 'helseid://claims/client/claims/orgnr_parent': '111111111' }, {}],
    [{ exp: 1 }, {}], [{}, { htu: 'https://other.example' }], [{}, { ath: 'wrong-hash' }],
  ];
  for (const [claims, proof] of invalidCases) {
    const client = createHelseIdClient(config(), async (url, options) => {
      assert.equal(url, TEST_TOKEN_ENDPOINT);
      return json(await tokenResponse(JSON.parse(options.body), claims, proof));
    });
    await assert.rejects(client.sendTask(exampleTask(), 'id'), e => e.code === 'invalid_test_token');
    assert.equal(client.status().authenticated, false);
  }
});

test('TTT errors and malformed responses never expose upstream diagnostics or credentials', async () => {
  const responses = [
    () => json({ detail: 'fixture-api-secret' }, 401),
    () => json({ isError: true, errorResponse: { errorMessage: 'fixture-api-secret' } }),
    () => new Response('fixture-api-secret'),
    () => json({ isError: false, successResponse: { accessTokenJwt: 'invalid' } }),
    () => { throw new Error('fixture-api-secret'); },
  ];
  for (const response of responses) {
    const client = createHelseIdClient(config(), response);
    await assert.rejects(client.getToken(), e => e.code && !e.message.includes('fixture-api-secret'));
  }
});

test('TTT sends once when the Helsenorge response is lost', async () => {
  let apiCalls = 0;
  const client = createHelseIdClient(config(), async (url, options) => {
    if (url === TEST_TOKEN_ENDPOINT) return json(await tokenResponse(JSON.parse(options.body)));
    apiCalls++; throw new Error('connection lost');
  });
  await assert.rejects(client.sendTask(exampleTask(), 'id'), e => e.code === 'delivery_unknown');
  assert.equal(apiCalls, 1);
});
