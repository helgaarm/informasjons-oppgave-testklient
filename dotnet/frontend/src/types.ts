export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }
export interface Coding extends JsonObject { system?: string; code?: string; display?: string }
export interface Identifier extends JsonObject { system?: string; value?: string }
export interface Concept extends JsonObject { text?: string; coding?: Coding[] }
export interface Reference extends JsonObject { reference?: string; type?: string; identifier?: Identifier; display?: string }
export interface Extension extends JsonObject { url?: string; valueDate?: string }
export interface Resource extends JsonObject {
  resourceType: string; id?: string; name?: string;
  contact?: (JsonObject & { purpose?: Concept; telecom?: Identifier[] })[];
}
export interface TaskResource extends Resource {
  resourceType: 'Task'; status?: string; intent?: string; code?: Concept; description?: string;
  instantiatesUri?: string; identifier?: Identifier[]; requester?: Reference; owner?: Reference;
  meta?: JsonObject & { security?: Coding[] };
  contained?: Resource[];
  restriction?: JsonObject & { period?: JsonObject & { start?: string; end?: string }; extension?: Extension[] };
}
export type EnvironmentId = 'test01' | 'test02';
export interface TestEnvironment { id: EnvironmentId; label: string; endpoint: string; portalUrl: string; description: string }
export interface AuthStatus {
  mode: 'test-token' | 'client_credentials'; configured: boolean; authenticated: boolean; editable: boolean;
  missing: string[]; scope: string; clientId: string; issuer: string; audience?: string; parent?: string; child?: string;
  clientTenancy?: string; expiresAt?: string | null; organization?: string | null; tokenType?: string | null;
}
export interface Config { environment: EnvironmentId; endpoint: string; environments: TestEnvironment[]; csrf: string; auth: AuthStatus }
export interface ConnectionValues { apiKey: string; audience: string; scope: string; parent: string; child: string }
export interface ValidationIssue { path: string; message: string; severity: string; source?: string }
export interface FieldDefinition { name?: string; type: string; multiple?: boolean; required?: boolean; choice?: string | null; properties?: FieldDefinition[] }
export type FieldSchema = Record<string, FieldDefinition[]>;
export interface Notice { text: string; error?: boolean }
export interface SubmissionResult {
  ok: boolean; status?: number; environment: EnvironmentId; body?: JsonValue; deliveryUnknown?: boolean;
  location?: string | null; correlationId?: string; receivedAt?: string;
}
export interface Receipt { at: string; environment: EnvironmentId; status?: number; ok: boolean; deliveryUnknown?: boolean; correlationId?: string }
export interface Requests {
  '/api/tasks/import': { text: string };
  '/api/tasks/validate': { task: TaskResource };
  '/api/tasks/send': { task: TaskResource; environment: EnvironmentId; confirmTestData: boolean };
  '/api/auth/connect': Record<string, never>;
  '/api/auth/settings': ConnectionValues;
}
export interface Responses {
  '/api/tasks/import': { task: TaskResource };
  '/api/tasks/validate': { valid: boolean; issues: ValidationIssue[] };
  '/api/tasks/send': SubmissionResult;
  '/api/auth/connect': AuthStatus;
  '/api/auth/settings': AuthStatus;
}
