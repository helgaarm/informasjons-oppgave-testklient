// Fixed targets from Helsenorge's official test-environment documentation.
// Never accept an endpoint URL from a browser request or saved settings.
export const DEFAULT_ENVIRONMENT = 'test02';
export const TEST_ENVIRONMENTS = Object.freeze([
  Object.freeze({
    id: 'test01', label: 'Test01',
    endpoint: 'https://eksternapi.hn.test.nhn.no/oppgave/v1/Task',
    portalUrl: 'https://tjenester.hn.test.nhn.no/',
    description: 'For testing av ny funksjonalitet. Kan være mindre stabilt enn Test02.',
  }),
  Object.freeze({
    id: 'test02', label: 'Test02',
    endpoint: 'https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task',
    portalUrl: 'https://tjenester.hn2.test.nhn.no/',
    description: 'Vanlig område for integrasjonstesting mot gjeldende tjenester.',
  }),
]);

export function getTestEnvironment(id) {
  return TEST_ENVIRONMENTS.find(environment => environment.id === id);
}
