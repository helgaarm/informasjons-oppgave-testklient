import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, calculateJwkThumbprint, decodeJwt } from 'jose';
import { HelseIdClient, IntegrationError, readLimited } from './helseid.js';
import { ISSUER } from '../shared/task.js';

export const TEST_TOKEN_ENDPOINT = 'https://helseid-ttt.test.nhn.no/v2/create-test-token-with-key';
const localTestClientId = randomUUID();
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clientName = 'Informasjonsoppgave testklient';
const clientTenancyClaim = 'helseid://claims/client/client_tenancy';
// NHN's TTT ClientTenancyType enum: MultiTenant = 0, SingleTenant = 1, None = 2.
// This test client acts for one explicitly selected organization at a time.
const singleTenant = 1;

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
    // A synthetic TTT identity, stable while this server is running. This does
    // not register a client or grant access in Helsenorge.
    this.testClientId = config.testClientId?.toLowerCase() || localTestClientId;
  }
  status() {
    const missing = missingConfiguration(this.config);
    const active = this.token && this.token.expiresAt > Date.now() + 30000;
    return { mode: 'test-token', configured: missing.length === 0, missing,
      authenticated: !!active, issuer: ISSUER, audience: this.config.audience, clientId: this.testClientId,
      scope: this.config.scope, parent: this.config.parent, child: this.config.child, clientTenancy: 'single-tenant',
      expiresAt: active ? new Date(this.token.expiresAt).toISOString() : null,
      organization: active ? this.token.organization : null, tokenType: active ? 'DPoP' : null };
  }
  async loadKey() {
    if (this.key) return;
    const pair = await generateKeyPair('PS256');
    this.key = pair.privateKey;
    this.verificationKey = pair.publicKey;
    this.publicKey = await exportJWK(pair.publicKey);
  }
  async obtainToken() {
    if (missingConfiguration(this.config).length) {
      throw new IntegrationError('Fyll inn API-nøkkel, API-mottaker, tilgang og testvirksomhet i tilkoblingsoppsettet.', 503, 'not_configured');
    }
    if (!/^\d{9}$/.test(this.config.parent) || (this.config.child && !/^\d{9}$/.test(this.config.child))) {
      throw new IntegrationError('Oppgi organisasjonsnummer med ni siffer for testvirksomheten.', 503, 'invalid_configuration');
    }
    if (!uuid.test(this.testClientId) || this.testClientId === '00000000-0000-0000-0000-000000000000') {
      throw new IntegrationError('HELSEID_TTT_CLIENT_ID må være en gyldig UUID. La verdien være tom for å bruke appens automatiske test-ID.', 503, 'invalid_configuration');
    }
    await this.loadKey();
    const scope = this.config.scope.split(/\s+/);
    const tokenId = randomUUID();
    // TTT supports cnfJkt when the caller creates its own DPoP proofs.
    // Only the public-key thumbprint leaves this process, never the private key.
    const jkt = await calculateJwkThumbprint(this.publicKey);
    let response;
    try {
      response = await this.request(TEST_TOKEN_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Auth-Key': this.config.apiKey },
        body: JSON.stringify({
          audience: this.config.audience, withoutDefaultClientClaims: true, withoutDefaultUserClaims: true,
          createDPoPTokenWithDPoPProof: false,
          expirationParameters: { expirationTimeInSeconds: 300 },
          clientClaimsParameters: { scope, orgnrParent: this.config.parent, cnfJkt: jkt,
            clientId: this.testClientId, clientName, jti: tokenId,
            clientTenancy: true, clientTenancyType: singleTenant,
            clientAuthenticationMethodsReferences: 'private_key_jwt',
            ...(this.config.child ? { orgnrChild: this.config.child } : {}) },
        }),
      });
    } catch {
      throw new IntegrationError('Kunne ikke kontakte HelseID test-token-tjenesten. Kontroller nettverk og prøv igjen.', 502, 'ttt_unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel();
      const message = response.status === 401
        ? 'Test-token-tjenesten avviste API-nøkkelen (HTTP 401). Lim inn en gyldig nøkkel fra HelseID Selvbetjening test og lagre oppsettet.'
        : response.status === 400
          ? 'Test-token-tjenesten avviste tokenforespørselen (HTTP 400). Kontroller API-mottaker, tilgang og organisasjonsnummer. Feilen kan også skyldes formatet appen sender.'
          : `Test-token-tjenesten svarte HTTP ${response.status}. Prøv igjen, eller kontroller tilgangen i HelseID Selvbetjening test.`;
      throw new IntegrationError(message, 502, 'ttt_rejected');
    }
    let result;
    try { result = JSON.parse(await readLimited(response, 100000)); }
    catch { throw new IntegrationError('Test-token-tjenesten returnerte et ugyldig svar.', 502, 'invalid_test_token'); }
    if (result?.isError === true) {
      // Upstream diagnostics can contain tokens or API keys; do not relay them.
      throw new IntegrationError('Test-token-tjenesten avviste tokenforespørselen. Kontroller audience, scope og testvirksomhet.', 502, 'ttt_rejected');
    }
    const value = result?.successResponse?.accessTokenJwt;
    let claims;
    try {
      claims = decodeJwt(value);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      const scopes = Array.isArray(claims.scope) ? claims.scope : String(claims.scope ?? '').split(/\s+/);
      const now = Date.now() / 1000;
      if (claims.iss !== ISSUER || !audiences.includes(this.config.audience)
        || claims.client_id !== this.testClientId
        || claims['helseid://claims/client/client_name'] !== clientName
        || claims[clientTenancyClaim] !== 'single-tenant' || claims.client_amr !== 'private_key_jwt'
        || claims.jti !== tokenId
        || !Number.isFinite(claims.exp) || claims.exp <= now + 30
        || !Number.isFinite(claims.iat) || claims.iat > now + 30 || claims.iat >= claims.exp
        || !Number.isFinite(claims.nbf) || claims.nbf > now + 30 || claims.nbf >= claims.exp
        || claims.cnf?.jkt !== jkt || claims['helseid://claims/client/claims/orgnr_parent'] !== this.config.parent
        || (this.config.child && claims['helseid://claims/client/claims/orgnr_child'] !== this.config.child)
        || !scope.every(s => scopes.includes(s))) throw new Error('invalid claims');
    } catch {
      throw new IntegrationError('Test-tokenet mangler påkrevde klientopplysninger eller har feil gyldighet, innhold eller DPoP-binding.', 502, 'invalid_test_token');
    }
    this.token = { value, expiresAt: Math.min(claims.exp * 1000, Date.now() + 300000), organization: this.config.parent };
    // Inherited sendTask signs a fresh proof locally per API request,
    // including any DPoP nonce challenge.
    return this.token;
  }
}
