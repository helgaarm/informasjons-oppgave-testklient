import { createHash } from 'node:crypto';
import { generateKeyPair, exportJWK, calculateJwkThumbprint, decodeJwt, jwtVerify } from 'jose';
import { HelseIdClient, IntegrationError, readLimited } from './helseid.js';
import { ISSUER, TASK_ENDPOINT } from '../shared/task.js';

export const TEST_TOKEN_ENDPOINT = 'https://helseid-ttt.test.nhn.no/v2/create-test-token-with-key';

function missingConfiguration(config) {
  return [['apiKey', 'HELSEID_TTT_API_KEY'], ['audience', 'HELSEID_TTT_AUDIENCE'],
    ['scope', 'HELSEID_SCOPE'], ['parent', 'HELSEID_ORGNR_PARENT']]
    .filter(([key]) => !config[key]).map(([, label]) => label);
}

// TTT needs an API key, not a registered OAuth client. The temporary DPoP key
// belongs only to this process. Never load or submit a registered client key.
export class TestTokenClient extends HelseIdClient {
  constructor(config, fetchImpl) {
    super({ ...config, algorithm: 'PS256' }, fetchImpl);
  }
  status() {
    const missing = missingConfiguration(this.config);
    const active = this.token && this.token.expiresAt > Date.now() + 30000;
    return { mode: 'test-token', configured: missing.length === 0, missing,
      authenticated: !!active, issuer: ISSUER, audience: this.config.audience,
      scope: this.config.scope, parent: this.config.parent,
      expiresAt: active ? new Date(this.token.expiresAt).toISOString() : null,
      organization: active ? this.token.organization : null, tokenType: active ? 'DPoP' : null };
  }
  async loadKey() {
    if (this.key) return;
    const pair = await generateKeyPair('PS256', { extractable: true });
    this.key = pair.privateKey;
    this.verificationKey = pair.publicKey;
    this.publicKey = await exportJWK(pair.publicKey);
    this.testKeyJwk = { ...await exportJWK(pair.privateKey), alg: 'PS256', use: 'sig' };
  }
  async obtainToken() {
    if (missingConfiguration(this.config).length) {
      throw new IntegrationError('Konfigurer TTT-API-nøkkel, audience, scope og testvirksomhet i .env.', 503, 'not_configured');
    }
    if (!/^\d{9}$/.test(this.config.parent) || (this.config.child && !/^\d{9}$/.test(this.config.child))) {
      throw new IntegrationError('Oppgi organisasjonsnummer med ni siffer for testvirksomheten.', 503, 'invalid_configuration');
    }
    await this.loadKey();
    const scope = this.config.scope.split(/\s+/);
    let response;
    try {
      response = await this.request(TEST_TOKEN_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Auth-Key': this.config.apiKey },
        body: JSON.stringify({
          audience: this.config.audience, withoutDefaultClientClaims: true, withoutDefaultUserClaims: true,
          createDPoPTokenWithDPoPProof: true,
          expirationParameters: { expirationTimeInSeconds: 300 },
          clientClaimsParameters: { scope, orgnrParent: this.config.parent,
            ...(this.config.child ? { orgnrChild: this.config.child } : {}) },
          dPoPProofParameters: { htmClaimValue: 'POST', htuClaimValue: TASK_ENDPOINT,
            privateKeyForProofCreation: JSON.stringify(this.testKeyJwk) },
        }),
      });
    } catch {
      throw new IntegrationError('Kunne ikke kontakte HelseID test-token-tjenesten. Kontroller nettverk og prøv igjen.', 502, 'ttt_unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new IntegrationError(`Test-token-tjenesten svarte HTTP ${response.status}. Kontroller API-nøkkelen og TTT-oppsettet.`, 502, 'ttt_rejected');
    }
    let result;
    try { result = JSON.parse(await readLimited(response, 100000)); }
    catch { throw new IntegrationError('Test-token-tjenesten returnerte et ugyldig svar.', 502, 'invalid_test_token'); }
    if (result?.isError === true) {
      // Upstream diagnostics can contain tokens or API keys; do not relay them.
      throw new IntegrationError('Test-token-tjenesten avviste tokenforespørselen. Kontroller audience, scope og testvirksomhet.', 502, 'ttt_rejected');
    }
    const value = result?.successResponse?.accessTokenJwt;
    const proof = result?.successResponse?.dPoPProof;
    let claims;
    try {
      claims = decodeJwt(value);
      const { payload, protectedHeader } = await jwtVerify(proof, this.verificationKey, { algorithms: ['PS256'], typ: 'dpop+jwt' });
      const jkt = await calculateJwkThumbprint(this.publicKey);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      const scopes = Array.isArray(claims.scope) ? claims.scope : String(claims.scope ?? '').split(/\s+/);
      if (claims.iss !== ISSUER || !audiences.includes(this.config.audience)
        || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() + 30000
        || claims.cnf?.jkt !== jkt || claims['helseid://claims/client/claims/orgnr_parent'] !== this.config.parent
        || (this.config.child && claims['helseid://claims/client/claims/orgnr_child'] !== this.config.child)
        || !scope.every(s => scopes.includes(s))
        || payload.htu !== TASK_ENDPOINT || payload.htm !== 'POST'
        || payload.ath !== createHash('sha256').update(value).digest('base64url')
        || !payload.jti || !Number.isFinite(payload.iat) || Math.abs(Date.now() / 1000 - payload.iat) > 60
        || protectedHeader.jwk?.d || await calculateJwkThumbprint(protectedHeader.jwk) !== jkt) throw new Error('invalid claims');
    } catch {
      throw new IntegrationError('Test-tokenet eller DPoP-beviset stemmer ikke med forespurt testoppsett.', 502, 'invalid_test_token');
    }
    this.token = { value, expiresAt: Math.min(claims.exp * 1000, Date.now() + 300000), organization: this.config.parent };
    // The supplied proof is validated, then discarded. Inherited sendTask signs
    // a fresh proof per API request, including any DPoP nonce challenge.
    return this.token;
  }
}
