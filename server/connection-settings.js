import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { configuration, IntegrationError } from './helseid.js';
import { createHelseIdClient } from './auth.js';

const fields = {
  apiKey: ['API-nøkkel', 8192],
  audience: ['API-mottaker (audience)', 512],
  scope: ['Tilgang (scope)', 2048],
  parent: ['Organisasjonsnummer', 9],
  child: ['Underenhet', 9],
};

function validateSettings(input, current) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(fields, key))) {
    throw new IntegrationError('Oppsettet inneholder ukjente felt.', 400, 'invalid_settings');
  }
  const next = {};
  for (const [key, [label, max]] of Object.entries(fields)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
      errors[key] = `Kontroller ${label.toLowerCase()}. Verdien er ugyldig.`;
      continue;
    }
    next[key] = value.trim();
    if (key === 'apiKey' && !next[key]) next[key] = current.apiKey;
    if (key !== 'child' && !next[key]) errors[key] = `Fyll inn ${label.toLowerCase()}.`;
  }
  for (const key of ['parent', 'child']) {
    if (next[key] && !/^\d{9}$/.test(next[key])) errors[key] = 'Organisasjonsnummeret må ha ni siffer.';
  }
  if (Object.keys(errors).length) {
    const error = new IntegrationError('Kontroller de markerte feltene.', 400, 'invalid_settings');
    error.fields = errors;
    throw error;
  }
  return next;
}

// A fixed local file, excluded by secrets/ in .gitignore. No paths or endpoints
// can be supplied by the browser. Saved settings take precedence in TTT mode.
export async function createConnectionSettings({ directory, initial = configuration(), clientFactory = createHelseIdClient }) {
  const file = path.join(directory, 'connection.json');
  let current = initial;
  if (initial.mode === 'test-token') {
    let saved;
    try { saved = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Kunne ikke lese det lokale tilkoblingsoppsettet i secrets/connection.json.');
    }
    if (saved !== undefined) {
      try {
        if (saved.length > 20000) throw new Error();
        current = { ...initial, ...validateSettings(JSON.parse(saved), { apiKey: '' }) };
      } catch { throw new Error('Det lokale tilkoblingsoppsettet i secrets/connection.json er ugyldig. Rett eller fjern filen og start på nytt.'); }
    }
  }
  let saving = false;
  return {
    client: clientFactory(current),
    async save(input) {
      if (current.mode !== 'test-token') throw new IntegrationError('Dette skjemaet er bare tilgjengelig for test-token-tjenesten.', 400, 'unsupported_auth_mode');
      if (saving) throw new IntegrationError('Oppsettet lagres allerede. Prøv igjen om et øyeblikk.', 409, 'settings_busy');
      const settings = validateSettings(input, current);
      const next = { ...current, ...settings };
      const client = clientFactory(next);
      const temporary = path.join(directory, `connection-${randomUUID()}.tmp`);
      saving = true;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        await rename(temporary, file);
        current = next;
        return client;
      } catch {
        throw new IntegrationError('Kunne ikke lagre oppsettet lokalt. Kontroller at appen har skrivetilgang til secrets-mappen, og prøv igjen.', 500, 'settings_write_failed');
      } finally {
        await unlink(temporary).catch(() => {});
        saving = false;
      }
    },
  };
}
