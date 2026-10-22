import { configuration, HelseIdClient, IntegrationError } from './helseid.js';
import { TestTokenClient } from './test-token.js';

export function createHelseIdClient(config = configuration(), fetchImpl = globalThis.fetch) {
  if (config.mode === 'test-token') return new TestTokenClient(config, fetchImpl);
  if (config.mode === 'client_credentials') return new HelseIdClient(config, fetchImpl);
  throw new IntegrationError('HELSEID_AUTH_MODE må være test-token eller client_credentials.', 503, 'invalid_configuration');
}
