export class UnconfirmedResponseError extends Error {
  constructor() {
    super('Kunne ikke bekrefte svaret fra den lokale serveren.');
    this.name = 'UnconfirmedResponseError';
  }
}

export async function postJson(path, payload, config) {
  if (!config) throw new Error('Vent til den lokale serveren er klar.');
  // Fail locally before fetching if the payload cannot be serialized.
  const body = JSON.stringify(payload);
  let response, data;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrf }, body });
    data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new UnconfirmedResponseError();
  } catch {
    // A lost or unreadable response does not tell us whether the POST succeeded.
    // Do not expose raw network errors or response bodies in the banner.
    throw new UnconfirmedResponseError();
  }
  if (!response.ok && !Object.hasOwn(data, 'ok')) {
    if (typeof data.error !== 'string' || !data.error) throw new UnconfirmedResponseError();
    const error = new Error(data.error);
    error.issues = data.issues; error.code = data.code; error.fields = data.fields;
    throw error;
  }
  return data;
}

export function requireSubmissionResult(data, environment) {
  if (typeof data.ok !== 'boolean' || !Number.isInteger(data.status) || data.status < 200 || data.status > 599
      || data.ok !== (data.status < 300) || data.environment !== environment
      || (data.deliveryUnknown !== undefined && typeof data.deliveryUnknown !== 'boolean')
      || (data.ok && data.deliveryUnknown)) throw new UnconfirmedResponseError();
  return data;
}
