import { readFile } from 'node:fs/promises';
import { createPrivateKey, createPublicKey, createHash, randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, decodeJwt, calculateJwkThumbprint } from 'jose';
import { ISSUER, TASK_ENDPOINT } from '../shared/task.js';

export class IntegrationError extends Error {
  constructor(message, status = 502, code = 'integration_error') { super(message); this.status = status; this.code = code; }
}
export async function readLimited(response, max = 1024 * 1024) {
  let size = 0; const chunks = [];
  for await (const part of response.body ?? []) {
    size += part.length;
    if (size > max) throw new IntegrationError('Svaret fra tjenesten er for stort.');
    chunks.push(Buffer.from(part));
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function configuration(env = process.env) {
  return {
    mode: env.HELSEID_AUTH_MODE?.trim() || (env.HELSEID_CLIENT_ID?.trim() ? 'client_credentials' : 'test-token'),
    apiKey: env.HELSEID_TTT_API_KEY?.trim() ?? '',
    audience: env.HELSEID_TTT_AUDIENCE?.trim() ?? '',
    clientId: env.HELSEID_CLIENT_ID?.trim() ?? '',
    scope: env.HELSEID_SCOPE?.trim() ?? '',
    keyFile: env.HELSEID_PRIVATE_KEY_FILE?.trim() ?? '',
    keyId: env.HELSEID_KEY_ID?.trim() ?? '',
    algorithm: env.HELSEID_SIGNING_ALG || 'PS256',
    multiTenant: env.HELSEID_MULTI_TENANT === 'true',
    parent: env.HELSEID_ORGNR_PARENT?.trim() ?? '',
    child: env.HELSEID_ORGNR_CHILD?.trim() ?? '',
  };
}
export function missingConfiguration(config) {
  const fields = [['clientId', 'HELSEID_CLIENT_ID'], ['scope', 'HELSEID_SCOPE'], ['keyFile', 'HELSEID_PRIVATE_KEY_FILE']];
  if (config.multiTenant) fields.push(['parent', 'HELSEID_ORGNR_PARENT']);
  return fields.filter(([key]) => !config[key]).map(([, label]) => label);
}
export class HelseIdClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config; this.fetch = fetchImpl; this.token = null; this.pending = null;
    this.discovery = null; this.key = null; this.tokenNonce = undefined; this.apiNonce = undefined;
  }
  status() {
    const missing = missingConfiguration(this.config);
    const active = this.token && this.token.expiresAt > Date.now() + 30000;
    return { mode: 'client_credentials', configured: missing.length === 0, missing, authenticated: !!active,
      clientId: this.config.clientId, scope: this.config.scope, issuer: ISSUER,
      expiresAt: active ? new Date(this.token.expiresAt).toISOString() : null,
      organization: active ? this.token.organization : null, tokenType: active ? 'DPoP' : null };
  }
  async loadKey() {
    if (this.key) return;
    if (missingConfiguration(this.config).length) throw new IntegrationError('HelseID test er ikke konfigurert. Fyll ut .env og legg privatnøkkelen i secrets/.', 503, 'not_configured');
    if (!['PS256', 'PS384', 'PS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'].includes(this.config.algorithm)) throw new IntegrationError('Ugyldig signeringsalgoritme i konfigurasjonen.', 503, 'invalid_configuration');
    try {
      const source = await readFile(this.config.keyFile, 'utf8');
      if (source.trim().startsWith('{')) {
        const jwk = JSON.parse(source);
        if (!jwk.d || (jwk.alg && jwk.alg !== this.config.algorithm)) throw new Error('key');
        this.key = createPrivateKey({ key: jwk, format: 'jwk' });
        this.kid = this.config.keyId || jwk.kid;
      } else { this.key = createPrivateKey(source); this.kid = this.config.keyId; }
      if (!this.kid) throw new Error('kid');
      this.publicKey = await exportJWK(createPublicKey(this.key));
    } catch {
      this.key = null;
      throw new IntegrationError('Kunne ikke laste privat JWK/PEM. Kontroller filsti, algoritme og nøkkel-ID (kid).', 503, 'invalid_key');
    }
  }
  async request(url, options = {}) {
    return this.fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  }
  async discover() {
    if (this.discovery) return this.discovery;
    const res = await this.request(`${ISSUER}/.well-known/openid-configuration`);
    if (!res.ok) throw new IntegrationError(`HelseID discovery svarte HTTP ${res.status}.`);
    const doc = JSON.parse(await readLimited(res, 100000));
    const endpoint = new URL(doc.token_endpoint);
    if (doc.issuer !== ISSUER || endpoint.origin !== ISSUER || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new IntegrationError('HelseID discovery returnerte et uventet endepunkt.');
    this.discovery = doc;
    return doc;
  }
  authorizationDetails() {
    const { multiTenant, parent, child } = this.config;
    if (multiTenant && !/^\d{9}$/.test(parent)) throw new IntegrationError('Oppgi gyldig organisasjonsnummer for hovedenhet.', 503, 'invalid_configuration');
    if (child && !/^\d{9}$/.test(child)) throw new IntegrationError('Oppgi gyldig organisasjonsnummer for underenhet.', 503, 'invalid_configuration');
    if (!multiTenant && !child) return undefined;
    return [{ type: 'helseid_authorization', practitioner_role: { organization: { identifier: {
      system: multiTenant ? 'urn:oid:1.0.6523' : 'urn:oid:2.16.578.1.12.4.1.4.101', type: 'ENH',
      value: multiTenant ? `NO:ORGNR:${parent}${child ? `:${child}` : ''}` : child,
    } } } }];
  }
  async assertion() {
    await this.loadKey();
    const details = this.authorizationDetails();
    return new SignJWT(details ? { authorization_details: details } : {})
      .setProtectedHeader({ alg: this.config.algorithm, kid: this.kid, typ: 'client-authentication+jwt' })
      .setIssuer(this.config.clientId).setSubject(this.config.clientId).setAudience(ISSUER)
      .setIssuedAt().setNotBefore(Math.floor(Date.now() / 1000)).setExpirationTime('60s').setJti(randomUUID()).sign(this.key);
  }
  async proof(url, method, nonce, accessToken) {
    await this.loadKey();
    const target = new URL(url); target.search = ''; target.hash = '';
    const claims = { htm: method.toUpperCase(), htu: target.href };
    if (nonce) claims.nonce = nonce;
    if (accessToken) claims.ath = createHash('sha256').update(accessToken).digest('base64url');
    return new SignJWT(claims).setProtectedHeader({ alg: this.config.algorithm, typ: 'dpop+jwt', jwk: this.publicKey })
      .setIssuedAt().setJti(randomUUID()).sign(this.key);
  }
  async getToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30000) return this.token;
    if (this.pending) return this.pending;
    this.pending = this.obtainToken();
    try { return await this.pending; } finally { this.pending = null; }
  }
  async obtainToken() {
    await this.loadKey();
    const { token_endpoint: endpoint } = await this.discover();
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.config.clientId,
        scope: this.config.scope, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await this.assertion() });
      const res = await this.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', DPoP: await this.proof(endpoint, 'POST', this.tokenNonce) }, body });
      const raw = await readLimited(res, 100000);
      let result; try { result = JSON.parse(raw); } catch { throw new IntegrationError(`HelseID svarte HTTP ${res.status} uten gyldig JSON.`); }
      const nonce = res.headers.get('dpop-nonce');
      if (nonce) this.tokenNonce = nonce;
      if (res.status === 400 && result.error === 'use_dpop_nonce' && nonce && attempt === 0) continue;
      if (!res.ok) {
        const code = /^[a-z_]{1,60}$/.test(result.error ?? '') ? result.error : 'token_error';
        throw new IntegrationError(`HelseID avviste autentiseringen (HTTP ${res.status}, ${code}). Kontroller klientens nøkkel, scope og godkjenning.`, 502, code);
      }
      if (result.token_type?.toLowerCase() !== 'dpop' || typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 30) throw new IntegrationError('HelseID returnerte ikke et gyldig DPoP-token.');
      const claims = decodeJwt(result.access_token);
      const thumbprint = await calculateJwkThumbprint(this.publicKey);
      if (claims.cnf?.jkt !== thumbprint) throw new IntegrationError('HelseID-tokenet er ikke bundet til klientens DPoP-nøkkel.');
      const organization = claims['helseid://claims/client/claims/orgnr_parent'];
      if (!/^\d{9}$/.test(organization ?? '')) throw new IntegrationError('Tokenet mangler orgnr_parent som Helsenorge krever. Kontroller organisasjon/delegering i HelseID.', 502, 'missing_organization');
      const expiresAt = Math.min(Date.now() + result.expires_in * 1000, typeof claims.exp === 'number' ? claims.exp * 1000 : Infinity);
      this.token = { value: result.access_token, expiresAt, organization };
      return this.token;
    }
    throw new IntegrationError('HelseID kunne ikke fullføre DPoP-utfordringen.');
  }
  async sendTask(task, correlationId) {
    const token = await this.getToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      const proof = await this.proof(TASK_ENDPOINT, 'POST', this.apiNonce, token.value);
      let response;
      try {
        response = await this.request(TASK_ENDPOINT, { method: 'POST', headers: {
          'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json',
          Authorization: `DPoP ${token.value}`, DPoP: proof,
          'X-Correlation-ID': correlationId,
        }, body: JSON.stringify(task) });
      } catch { throw new IntegrationError('Forbindelsen ble avbrutt under innsending. Leveringsstatus er ukjent. Kontroller oppgaven i test02 før et nytt forsøk.', 502, 'delivery_unknown'); }
      const nonce = response.headers.get('dpop-nonce');
      if (nonce) this.apiNonce = nonce;
      if (response.status === 401 && nonce && /use_dpop_nonce/.test(response.headers.get('www-authenticate') ?? '') && attempt === 0) { await response.body?.cancel(); continue; }
      let raw;
      try { raw = await readLimited(response); }
      catch { throw new IntegrationError('Innsendingen fikk et ufullstendig svar. Leveringsstatus er ukjent; kontroller test02 før et nytt forsøk.', 502, 'delivery_unknown'); }
      let body; try { body = JSON.parse(raw); } catch { body = raw; }
      if ([401, 403].includes(response.status)) this.token = null;
      return { ok: response.ok, status: response.status, body,
        location: response.headers.get('location'), correlationId,
        deliveryUnknown: response.status >= 500 || response.status === 408,
        receivedAt: new Date().toISOString() };
    }
    throw new IntegrationError('Helsenorge avviste DPoP-beviset.');
  }
}
