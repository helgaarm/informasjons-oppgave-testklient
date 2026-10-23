import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SignJWT, calculateJwkThumbprint, generateKeyPair, jwtVerify } from 'jose';
import { configuration, HelseIdClient } from '../server/helseid.js';
import { createHelseIdClient } from '../server/auth.js';
import { TestTokenClient, TEST_TOKEN_ENDPOINT } from '../server/test-token.js';
import { ISSUER, TASK_ENDPOINT, exampleTask } from '../shared/task.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const config = () => configuration({ HELSEID_AUTH_MODE: 'test-token', HELSEID_TTT_API_KEY: 'fixture-api-secret',
  HELSEID_TTT_AUDIENCE: 'fixture:audience', HELSEID_SCOPE: 'fixture:scope fixture:second', HELSEID_ORGNR_PARENT: '999999999' });
const issuerKeys = await generateKeyPair('RS256');

async function tokenResponse(request, changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: ISSUER, aud: request.audience, scope: request.clientClaimsParameters.scope,
    client_id: request.clientClaimsParameters.clientId,
    'helseid://claims/client/client_name': request.clientClaimsParameters.clientName,
    'helseid://claims/client/client_tenancy': request.clientClaimsParameters.clientTenancy
      ? ['multi-tenant', 'single-tenant', 'none'][request.clientClaimsParameters.clientTenancyType] : undefined,
    client_amr: request.clientClaimsParameters.clientAuthenticationMethodsReferences,
    jti: request.clientClaimsParameters.jti,
    iat: now, nbf: now, exp: now + 300, cnf: { jkt: request.clientClaimsParameters.cnfJkt },
    'helseid://claims/client/claims/orgnr_parent': request.clientClaimsParameters.orgnrParent,
    ...(request.clientClaimsParameters.orgnrChild ? { 'helseid://claims/client/claims/orgnr_child': request.clientClaimsParameters.orgnrChild } : {}),
    ...changes };
  const accessTokenJwt = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).sign(issuerKeys.privateKey);
  return { isError: false, successResponse: { accessTokenJwt } };
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
      // Exact contract: no private key, user data, Task, or server-generated proof.
      assert.deepEqual(body, {
        audience: 'fixture:audience', withoutDefaultClientClaims: true, withoutDefaultUserClaims: true,
        createDPoPTokenWithDPoPProof: false, expirationParameters: { expirationTimeInSeconds: 300 },
        clientClaimsParameters: { scope: ['fixture:scope', 'fixture:second'], orgnrParent: '999999999',
          cnfJkt: await calculateJwkThumbprint(client.publicKey), clientId: client.status().clientId,
          clientName: 'Informasjonsoppgave testklient', jti: body.clientClaimsParameters.jti,
          clientTenancy: true, clientTenancyType: 1, clientAuthenticationMethodsReferences: 'private_key_jwt' },
      });
      assert.match(body.clientClaimsParameters.clientId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      assert.match(body.clientClaimsParameters.jti, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
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
    assert.equal(await calculateJwkThumbprint(verified.protectedHeader.jwk), await calculateJwkThumbprint(client.publicKey));
    assert.equal(verified.payload.htm, 'POST'); assert.equal(verified.payload.htu, TASK_ENDPOINT);
    assert.equal(verified.payload.ath, createHash('sha256').update(response.successResponse.accessTokenJwt).digest('base64url'));
    proofs.push(verified.payload.jti);
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
  assert.equal(client.key.extractable, false);
});

test('TTT uses the selected environment for the API request and DPoP proof', async () => {
  const targets = [
    ['test01', 'https://eksternapi.hn.test.nhn.no/oppgave/v1/Task'],
    ['test02', 'https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task'],
  ];
  let tokenCalls = 0, apiCalls = 0;
  const client = createHelseIdClient(config(), async (url, options) => {
    if (url === TEST_TOKEN_ENDPOINT) {
      tokenCalls++;
      return json(await tokenResponse(JSON.parse(options.body)));
    }
    assert.equal(url, targets[apiCalls++][1]);
    const { payload } = await jwtVerify(options.headers.DPoP, client.verificationKey);
    assert.equal(payload.htu, url);
    assert.equal(options.headers['X-Auth-Key'], undefined);
    return json({}, 201);
  });
  for (const [id] of targets) {
    const result = await client.sendTask(exampleTask(), 'id', id);
    assert.equal(result.status, 201);
    assert.equal(result.environment, id);
  }
  assert.equal(tokenCalls, 1);
  assert.equal(apiCalls, 2);
});

test('TTT rejects mismatched token claims and DPoP bindings before sending any Task', async () => {
  const invalidCases = [
    { 'helseid://claims/client/client_tenancy': undefined },
    { 'helseid://claims/client/client_tenancy': 'none' },
    { 'helseid://claims/client/client_tenancy': 'multi-tenant' },
    { 'helseid://claims/client/client_name': undefined },
    { client_amr: undefined }, { client_amr: 'wrong-method' }, { jti: undefined }, { jti: 'unrelated-token' },
    { iat: undefined }, { iat: Math.floor(Date.now() / 1000) + 120 },
    { nbf: undefined }, { nbf: Math.floor(Date.now() / 1000) + 120 },
    { client_id: undefined }, { client_id: '' }, { client_id: 'not-a-uuid' },
    { client_id: '11111111-1111-4111-8111-111111111111' },
    { cnf: { jkt: 'unrelated-key' } }, { cnf: null }, { aud: 'wrong:api' },
    { iss: 'https://untrusted.example' }, { scope: ['wrong:scope'] },
    { 'helseid://claims/client/claims/orgnr_parent': '111111111' },
    { 'helseid://claims/client/claims/orgnr_child': '111111111' },
    { 'helseid://claims/client/claims/orgnr_child': undefined }, { exp: 1 }, { exp: undefined },
  ];
  for (const claims of invalidCases) {
    const client = createHelseIdClient({ ...config(), child: '222222222' }, async (url, options) => {
      assert.equal(url, TEST_TOKEN_ENDPOINT);
      return json(await tokenResponse(JSON.parse(options.body), claims));
    });
    await assert.rejects(client.sendTask(exampleTask(), 'id'), e => e.code === 'invalid_test_token');
    assert.equal(client.status().authenticated, false);
  }
});

test('TTT uses its own test identity and keeps it stable across token renewals and configuration saves', async () => {
  const requestedIds = [];
  const tokenIds = [];
  const settings = { ...config(), clientId: 'registered-client-must-not-be-reused' };
  const fetchToken = async (url, options) => {
    assert.equal(url, TEST_TOKEN_ENDPOINT);
    const body = JSON.parse(options.body);
    requestedIds.push(body.clientClaimsParameters.clientId);
    tokenIds.push(body.clientClaimsParameters.jti);
    return json(await tokenResponse(body));
  };
  const client = createHelseIdClient(settings, fetchToken);
  await client.getToken();
  client.token = null;
  await client.getToken();
  await createHelseIdClient(settings, fetchToken).getToken();
  assert.equal(new Set(requestedIds).size, 1);
  assert.equal(new Set(tokenIds).size, 3);
  assert.notEqual(requestedIds[0], settings.clientId);
});

test('TTT accepts an explicit test client ID without switching to registered-client mode', async () => {
  const id = 'A1111111-1111-4111-8111-111111111111';
  const settings = configuration({ HELSEID_TTT_CLIENT_ID: ` ${id} ` });
  assert.equal(settings.mode, 'test-token');
  const client = createHelseIdClient({ ...config(), testClientId: settings.testClientId }, async (url, options) => {
    assert.equal(url, TEST_TOKEN_ENDPOINT);
    const body = JSON.parse(options.body);
    assert.equal(body.clientClaimsParameters.clientId, id.toLowerCase());
    return json(await tokenResponse(body));
  });
  await client.getToken();
  assert.equal(client.status().clientId, id.toLowerCase());
  assert.equal(client.status().authenticated, true);
  for (const testClientId of ['invalid', '00000000-0000-0000-0000-000000000000']) {
    const invalid = createHelseIdClient({ ...config(), testClientId }, () => assert.fail('No network expected'));
    await assert.rejects(invalid.getToken(), e => e.code === 'invalid_configuration');
  }
});

test('TTT accepts the requested child organization without a service-generated proof', async () => {
  const client = createHelseIdClient({ ...config(), child: '222222222' }, async (url, options) => {
    assert.equal(url, TEST_TOKEN_ENDPOINT);
    const request = JSON.parse(options.body);
    assert.equal(request.clientClaimsParameters.orgnrChild, '222222222');
    return json(await tokenResponse(request));
  });
  await client.getToken();
  assert.equal(client.status().authenticated, true);
});

test('TTT distinguishes an invalid API key from a rejected token request', async () => {
  for (const [status, message] of [[401, /avviste API-nøkkelen \(HTTP 401\)/], [400, /avviste tokenforespørselen \(HTTP 400\)/]]) {
    const client = createHelseIdClient(config(), async () => json({ detail: 'fixture-api-secret' }, status));
    await assert.rejects(client.getToken(), e => e.code === 'ttt_rejected' && message.test(e.message) && !e.message.includes('fixture-api-secret'));
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
