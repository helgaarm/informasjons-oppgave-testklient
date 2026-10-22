import express from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { TASK_ENDPOINT, ENVIRONMENT } from '../shared/task.js';
import { validateResource, importTask, fieldSchema } from './fhir.js';
import { IntegrationError } from './helseid.js';
import { createHelseIdClient } from './auth.js';

export function createApp({ client = createHelseIdClient(), origin = 'http://localhost:3000', dev = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const sessions = new Map();
  const validHosts = new Set([new URL(origin).host]);
  const originUrl = new URL(origin);
  if (['localhost', '127.0.0.1'].includes(originUrl.hostname)) {
    validHosts.add(`localhost:${originUrl.port || '80'}`); validHosts.add(`127.0.0.1:${originUrl.port || '80'}`);
  }
  app.use((req, res, next) => {
    if (!validHosts.has(req.get('host'))) return res.status(403).json({ error: 'Ukjent vertsnavn.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
    if (!dev) res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use('/api', (req, res, next) => {
    const requestOrigin = req.get('origin');
    if (requestOrigin && (new URL(origin).origin !== requestOrigin && ![...validHosts].some(h => `${originUrl.protocol}//${h}` === requestOrigin))) return res.status(403).json({ error: 'Forespørselen må komme fra testklienten.' });
    if (req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Forespørselen må komme fra testklienten.' });
    // The static schema must not race /config to replace its session cookie.
    if (req.method === 'GET' && req.path === '/schema') return next();
    const now = Date.now();
    for (const [id, session] of sessions) if (session.expires < now) sessions.delete(id);
    const id = /(?:^|;\s*)nhn_session=([a-f0-9]{64})(?:;|$)/.exec(req.get('cookie') ?? '')?.[1];
    let session = sessions.get(id);
    if (!session) {
      if (req.method !== 'GET') return res.status(403).json({ error: 'Økten er utløpt. Last siden på nytt.' });
      if (sessions.size >= 100) return res.status(429).json({ error: 'For mange økter. Prøv igjen senere.' });
      const newId = randomBytes(32).toString('hex');
      session = { csrf: randomBytes(32).toString('hex'), expires: now + 30 * 60000, submissions: new Map() };
      sessions.set(newId, session);
      res.set('Set-Cookie', `nhn_session=${newId}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800${originUrl.protocol === 'https:' ? '; Secure' : ''}`);
    }
    if (req.method !== 'GET' && req.get('x-csrf-token') !== session.csrf) return res.status(403).json({ error: 'Ugyldig økttoken. Last siden på nytt.' });
    req.session = session;
    next();
  });
  app.use('/api', express.json({ limit: '2mb', strict: true }));
  app.get('/api/config', (req, res) => res.json({ environment: ENVIRONMENT, endpoint: TASK_ENDPOINT,
    csrf: req.session.csrf, auth: client.status() }));
  app.get('/api/schema', (_req, res) => res.json(fieldSchema()));
  app.post('/api/auth/connect', async (_req, res) => { await client.getToken(); res.json(client.status()); });
  app.post('/api/tasks/import', (req, res) => {
    try { res.json({ task: importTask(req.body?.text) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/tasks/validate', (req, res) => {
    const issues = validateResource(req.body?.task);
    res.json({ valid: !issues.some(i => i.severity === 'error'), issues });
  });
  app.post('/api/tasks/send', async (req, res) => {
    const task = req.body?.task;
    const issues = validateResource(task);
    if (issues.some(i => i.severity === 'error')) return res.status(422).json({ error: 'Oppgaven har valideringsfeil.', issues });
    if (req.body?.confirmTestData !== true) return res.status(400).json({ error: 'Bekreft at oppgaven bruker testdata før innsending.' });
    const key = createHash('sha256').update(task.identifier.find(i => i.system === 'urn:ietf:rfc:3986').value).digest('hex');
    if (req.session.submissions.has(key)) return res.status(409).json({ error: 'Denne identifikatoren er allerede sendt eller har ukjent leveringsstatus i økten. Kontroller test02 før du oppretter en ny oppgave.' });
    if (req.session.submissions.size >= 100) return res.status(429).json({ error: 'Økten har nådd grensen for innsendinger.' });
    req.session.submissions.set(key, 'pending');
    const correlationId = randomUUID();
    try {
      const result = await client.sendTask(task, correlationId);
      if (result.ok || result.deliveryUnknown) req.session.submissions.set(key, result.ok ? 'sent' : 'unknown');
      else req.session.submissions.delete(key);
      res.status(result.ok ? 200 : 502).json(result);
    } catch (e) {
      if (e.code !== 'delivery_unknown') req.session.submissions.delete(key);
      else req.session.submissions.set(key, 'unknown');
      throw e;
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ukjent API-rute.' }));
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Forespørselen er for stor (maksimalt 2 MB).' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ugyldig JSON i forespørselen.' });
    if (err instanceof IntegrationError) return res.status(err.status).json({ error: err.message, code: err.code });
    res.status(502).json({ error: 'Tjenestekallet kunne ikke fullføres. Kontroller nettverk, HelseID-oppsett og tilgjengeligheten til testmiljøet.' });
  });
  return app;
}
