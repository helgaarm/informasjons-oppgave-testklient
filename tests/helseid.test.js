import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decodeJwt, decodeProtectedHeader, jwtVerify, exportJWK, calculateJwkThumbprint, SignJWT } from 'jose';
import { HelseIdClient, configuration } from '../server/helseid.js';
import { ISSUER, TASK_ENDPOINT, exampleTask } from '../shared/task.js';

async function setup(t, fetchImpl) {
  const dir = await mkdtemp(path.join(tmpdir(), 'nhn-test-key-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = await exportJWK(privateKey); jwk.kid = 'test-kid'; jwk.alg = 'PS256';
  const keyFile = path.join(dir, 'test.jwk'); await writeFile(keyFile, JSON.stringify(jwk), { mode: 0o600 });
  const client = new HelseIdClient({ clientId: 'test-client', scope: 'test-scope', keyFile, algorithm: 'PS256' }, fetchImpl);
  return { client, privateKey, publicKey };
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
test('private_key_jwt + DPoP nonce handshake signs fresh proofs, binds token and sends exact Task', async t => {
  let tokenCalls = 0; let apiCalls = 0; const assertions = []; const proofs = []; let accessToken;
  const fixture = await setup(t, async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.endsWith('openid-configuration')) return json({ issuer: ISSUER, token_endpoint: `${ISSUER}/connect/token` });
    if (url === `${ISSUER}/connect/token`) {
      tokenCalls++;
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('grant_type'), 'client_credentials'); assert.equal(fields.get('scope'), 'test-scope');
      const assertion = fields.get('client_assertion');
      const verified = await jwtVerify(assertion, fixture.publicKey, { issuer: 'test-client', audience: ISSUER });
      assert.equal(verified.payload.sub, 'test-client'); assert.ok(verified.payload.exp - verified.payload.iat <= 60);
      assert.equal(decodeProtectedHeader(assertion).typ, 'client-authentication+jwt');
      assert.equal(decodeProtectedHeader(assertion).kid, 'test-kid'); assertions.push(verified.payload.jti);
      const proof = options.headers.DPoP;
      await jwtVerify(proof, fixture.publicKey);
      const header = decodeProtectedHeader(proof); const payload = decodeJwt(proof); proofs.push(payload.jti);
      assert.equal(header.typ, 'dpop+jwt'); assert.equal(header.jwk.d, undefined); assert.equal(payload.htm, 'POST'); assert.equal(payload.htu, url); assert.equal(payload.ath, undefined);
      if (tokenCalls === 1) return json({ error: 'use_dpop_nonce' }, 400, { 'DPoP-Nonce': 'server-nonce' });
      assert.equal(payload.nonce, 'server-nonce');
      accessToken = await new SignJWT({ cnf: { jkt: await calculateJwkThumbprint(await exportJWK(fixture.publicKey)) }, 'helseid://claims/client/claims/orgnr_parent': '999999999' }).setProtectedHeader({ alg: 'PS256' }).setExpirationTime('5m').sign(fixture.privateKey);
      return json({ access_token: accessToken, token_type: 'DPoP', expires_in: 300 });
    }
    assert.equal(url, TASK_ENDPOINT); apiCalls++;
    assert.equal(options.headers.Authorization, `DPoP ${accessToken}`);
    assert.equal(options.headers['Content-Type'], 'application/fhir+json');
    const proof = decodeJwt(options.headers.DPoP); proofs.push(proof.jti);
    await jwtVerify(options.headers.DPoP, fixture.publicKey);
    assert.equal(proof.ath, createHash('sha256').update(accessToken).digest('base64url'));
    assert.equal(proof.htu, TASK_ENDPOINT);
    assert.equal(JSON.parse(options.body).focus.type, 'Communication');
    return json({ resourceType: 'Task', id: 'created-id' }, 201, { Location: `${TASK_ENDPOINT}/created-id` });
  });
  const result = await fixture.client.sendTask(exampleTask(), 'test-correlation');
  assert.equal(result.ok, true); assert.equal(result.status, 201);
  assert.equal(tokenCalls, 2); assert.equal(apiCalls, 1);
  assert.equal(new Set(assertions).size, 2); assert.equal(new Set(proofs).size, 3);
  assert.equal(fixture.client.status().organization, '999999999');
  assert.ok(!JSON.stringify(fixture.client.status()).includes(accessToken));
  await fixture.client.getToken(); assert.equal(tokenCalls, 2);
});
test('missing credentials fail closed without network access', async () => {
  const client = new HelseIdClient(configuration({}), () => assert.fail('No network expected'));
  assert.equal(client.status().configured, false);
  await assert.rejects(client.getToken(), e => e.code === 'not_configured');
});
test('discovery cannot redirect assertions to another issuer or endpoint', async t => {
  const { client } = await setup(t, () => json({ issuer: ISSUER, token_endpoint: 'https://untrusted.example/token' }));
  await assert.rejects(client.getToken(), /uventet endepunkt/);
});
test('lost API response is never automatically retried', async t => {
  let count = 0;
  const { client } = await setup(t, () => { count++; throw new Error('network lost'); });
  client.token = { value: 'test-access-token', expiresAt: Date.now() + 300000 };
  await assert.rejects(client.sendTask(exampleTask(), 'id'), e => e.code === 'delivery_unknown');
  assert.equal(count, 1);
});
test('multi-tenant organization selection is included only when configured', () => {
  const single = new HelseIdClient({}); assert.equal(single.authorizationDetails(), undefined);
  const multi = new HelseIdClient({ multiTenant: true, parent: '123456789', child: '987654321' });
  const identifier = multi.authorizationDetails()[0].practitioner_role.organization.identifier;
  assert.equal(identifier.value, 'NO:ORGNR:123456789:987654321'); assert.equal(identifier.system, 'urn:oid:1.0.6523');
});
