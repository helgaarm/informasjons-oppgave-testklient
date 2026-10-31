import { TEST_ENVIRONMENTS as original } from '../../../shared/environments.js';
import type { EnvironmentId, TestEnvironment } from './types';
export const DEFAULT_ENVIRONMENT: EnvironmentId = 'test02';
export const TEST_ENVIRONMENTS = original as readonly TestEnvironment[];
export function getTestEnvironment(id: string): TestEnvironment {
  const environment = TEST_ENVIRONMENTS.find(e => e.id === id);
  if (!environment) throw new Error('Velg Test01 eller Test02.');
  return environment;
}
