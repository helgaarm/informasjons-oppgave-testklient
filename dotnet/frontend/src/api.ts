import type { Config, EnvironmentId, Requests, Responses, SubmissionResult, ValidationIssue } from './types';

export class ApiError extends Error {
  code?: string;
  issues?: ValidationIssue[];
  fields?: Record<string, string>;
}
export class UnconfirmedResponseError extends ApiError {
  constructor() { super('Kunne ikke bekrefte svaret fra den lokale serveren.'); this.name = 'UnconfirmedResponseError'; }
}
export function apiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(error instanceof Error ? error.message : 'Forespørselen kunne ikke fullføres.');
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

export async function postJson<K extends keyof Requests>(path: K, payload: Requests[K], config: Config | null): Promise<Responses[K]> {
  if (!config) throw new ApiError('Vent til den lokale serveren er klar.');
  const body = JSON.stringify(payload);
  let response: Response, data: unknown;
  try {
    response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': config.csrf }, body });
    data = await response.json();
    if (!object(data)) throw new UnconfirmedResponseError();
  } catch { throw new UnconfirmedResponseError(); }
  if (!response.ok && !Object.hasOwn(data, 'ok')) {
    if (typeof data.error !== 'string' || !data.error) throw new UnconfirmedResponseError();
    const error = new ApiError(data.error);
    if (typeof data.code === 'string') error.code = data.code;
    if (Array.isArray(data.issues)) error.issues = data.issues as ValidationIssue[];
    if (object(data.fields)) error.fields = data.fields as Record<string, string>;
    throw error;
  }
  return data as unknown as Responses[K];
}

export function requireSubmissionResult(data: SubmissionResult, environment: EnvironmentId): SubmissionResult {
  if (typeof data.ok !== 'boolean' || !Number.isInteger(data.status) || data.status! < 200 || data.status! > 599
      || data.ok !== (data.status! < 300) || data.environment !== environment
      || (data.deliveryUnknown !== undefined && typeof data.deliveryUnknown !== 'boolean')
      || (data.ok && data.deliveryUnknown)) throw new UnconfirmedResponseError();
  return data;
}
