export const ENVIRONMENT = 'test02';
export const TASK_ENDPOINT = 'https://eksternapi.hn2.test.nhn.no/oppgave/v1/Task';
export const ISSUER = 'https://helseid-sts.test.nhn.no';
export const SYSTEMS = {
  uuid: 'urn:ietf:rfc:3986',
  fnr: 'urn:oid:2.16.578.1.12.4.1.4.1',
  orgnr: 'urn:oid:2.16.578.1.12.4.1.4.101',
  area: 'urn:oid:2.16.578.1.12.4.1.1.7618',
  sensitive: 'http://helsenorge.no/fhir/sensitiv-avsender',
  execution: 'http://helsenorge.no/fhir/KanUtforesAv',
  deadline: 'http://helsenorge.no/fhir/StructureDefinition/hn-task-deadline',
};
export const AREAS = [['1', 'Rettigheter og selvhjelp'], ['2', 'Pasientjournal'], ['3', 'Helsehjelp'], ['4', 'Forvaltning'], ['5', 'Sekundærbruk'], ['6', 'Ungdom']];
export function newTask(uuid = globalThis.crypto.randomUUID()) {
  return {
    resourceType: 'Task',
    meta: { security: [{ system: SYSTEMS.area, code: '3', display: 'Helsehjelp' }] },
    identifier: [{ system: SYSTEMS.uuid, value: `urn:uuid:${uuid}` }],
    status: 'ready', intent: 'proposal',
    code: { text: '' }, description: '', instantiatesUri: '',
    focus: { type: 'Communication' },
    owner: { type: 'Patient', identifier: { system: SYSTEMS.fnr, value: '' } },
    requester: { reference: '#requester-1', type: 'Organization' },
    contained: [{ resourceType: 'Organization', id: 'requester-1', name: '' }],
    restriction: { period: { end: '' } },
  };
}
export function exampleTask() {
  const task = newTask();
  task.code.text = 'Informasjon før avtalen din';
  task.description = 'Les informasjonen før avtalen. Du kan gå tilbake til siden når du ønsker det.';
  task.instantiatesUri = 'https://www.helsenorge.no/';
  task.contained[0].name = 'Eksempelavsender – test';
  const date = new Date(); date.setUTCDate(date.getUTCDate() + 30);
  task.restriction.period.end = date.toISOString().slice(0, 10);
  return task; // Testperson må alltid velges eksplisitt av operatøren.
}
export const getAt = (value, path) => path.reduce((v, key) => v?.[key], value);
export function setAt(value, path, next) {
  if (!path.length) return next;
  const [key, ...rest] = path;
  if (['__proto__', 'prototype', 'constructor'].includes(String(key))) throw new Error('Ugyldig feltnavn.');
  const copy = Array.isArray(value) ? [...value] : { ...value };
  if (!rest.length && next === undefined) {
    if (Array.isArray(copy)) copy.splice(Number(key), 1); else delete copy[key];
  } else {
    const child = setAt(value?.[key] ?? (typeof rest[0] === 'number' ? [] : {}), rest, next);
    if (next === undefined && child && typeof child === 'object' && Object.keys(child).length === 0) {
      if (Array.isArray(copy)) copy.splice(Number(key), 1); else delete copy[key];
    } else copy[key] = child;
  }
  return copy;
}
export function assertSafeObject(value, depth = 0, budget = { count: 0 }) {
  if (++budget.count > 20000 || depth > 40) throw new Error('FHIR-ressursen er for stor eller har for mange nivåer.');
  if (value && typeof value === 'object') for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('FHIR-ressursen inneholder et ugyldig feltnavn.');
    assertSafeObject(value[key], depth + 1, budget);
  }
}
export function parseTaskJson(text) {
  const value = JSON.parse(text);
  assertSafeObject(value);
  if (!value || value.resourceType !== 'Task') throw new Error('Filen må inneholde én FHIR Task. Bundle støttes ikke i denne klienten.');
  return value;
}
const uuid = /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const present = v => typeof v === 'string' && v.trim().length > 0;
function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const date = value.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
export function validateTask(task) {
  const issues = [];
  const add = (path, message, severity = 'error') => issues.push({ path, message, severity });
  if (!task || task.resourceType !== 'Task') { add('resourceType', 'Ressursen må være en FHIR Task.'); return issues; }
  try { assertSafeObject(task); } catch (e) { add('Task', e.message); return issues; }
  if (task.status !== 'ready') add('status', 'En ny oppgave må ha status ready.');
  if (!['proposal', 'plan'].includes(task.intent)) add('intent', 'Velg proposal eller plan.');
  if (task.intent === 'plan') add('intent', 'Plan skal bare brukes når oppgaven er direkte knyttet til helsehjelp.', 'warning');
  if (task.focus?.type !== 'Communication') add('focus.type', 'Informasjonsoppgaver må ha focus.type = Communication.');
  if (!Array.isArray(task.identifier) || !task.identifier.some(i => i?.system === SYSTEMS.uuid && uuid.test(i.value))) add('identifier', 'Oppgi en UUID som forretningsidentifikator med system urn:ietf:rfc:3986.');
  if (task.id && !uuid.test(task.id)) add('id', 'Helsenorge krever GUID som ressurs-ID.');
  if (task.id) add('id', 'Ved POST bestemmer Helsenorge ressurs-ID. Bruk identifier til oppfølging.', 'warning');
  for (const [path, value, max, required] of [
    ['code.text', task.code?.text, 250, true], ['description', task.description, 2000, true],
    ['reasonCode.text', task.reasonCode?.text, 250, false], ['statusReason.text', task.statusReason?.text, 250, false],
  ]) {
    if (required && !present(value)) add(path, 'Feltet må fylles ut.');
    if (value !== undefined && typeof value !== 'string') add(path, 'Verdien må være tekst.');
    if (typeof value === 'string' && value.length > max) add(path, `Maksimalt ${max} tegn.`);
  }
  try { const u = new URL(task.instantiatesUri); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error(); }
  catch { add('instantiatesUri', 'Oppgi en fullstendig http(s)-adresse til informasjonen.'); }
  if (task.instantiatesUri?.startsWith('http:')) add('instantiatesUri', 'Bruk HTTPS for informasjonssiden.', 'warning');
  if (task.owner?.type !== 'Patient' || task.owner?.identifier?.system !== SYSTEMS.fnr || !/^\d{11}$/.test(task.owner?.identifier?.value ?? '')) add('owner.identifier.value', 'Oppgi testpersonens 11-sifrede fødselsnummer/D-nummer i owner (Patient).');
  const security = Array.isArray(task.meta?.security) ? task.meta.security : [];
  const area = security.filter(c => c?.system === SYSTEMS.area);
  if (area.length !== 1 || !AREAS.some(([c]) => c === area[0]?.code)) add('meta.security', 'Velg ett gyldig tjenesteområde (kodeverk 7618).');
  const ref = task.requester?.reference;
  const contained = Array.isArray(task.contained) ? task.contained : [];
  const org = typeof ref === 'string' && ref.startsWith('#') ? contained.find(r => r?.id === ref.slice(1)) : undefined;
  if (!org || org.resourceType !== 'Organization' || task.requester?.type !== 'Organization') add('requester', 'Avsender må referere til en Organization i contained.');
  if (org && (!present(org.name) || org.name.length > 250)) add('contained.name', 'Oppgi avsenders navn (maksimalt 250 tegn).');
  for (const contact of (Array.isArray(org?.contact) ? org.contact : [])) {
    if (typeof contact?.purpose?.text === 'string' && contact.purpose.text.length > 1024) add('contained.contact.purpose.text', 'Kontaktbeskrivelse kan ha maksimalt 1024 tegn.');
  }
  const end = task.restriction?.period?.end;
  if (!validCalendarDate(end)) add('restriction.period.end', 'Oppgi en gyldig svarfrist.');
  else if (end.slice(0, 10) < new Date().toISOString().slice(0, 10)) add('restriction.period.end', 'Svarfristen har passert.', 'warning');
  if (task.restriction?.period?.start) add('restriction.period.start', 'Helsenorge dokumenterer ikke støtte for tidligste startdato.', 'warning');
  const extensions = Array.isArray(task.restriction?.extension) ? task.restriction.extension : [];
  for (const item of extensions.filter(x => x?.url === SYSTEMS.deadline)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.valueDate ?? '') || !validCalendarDate(item.valueDate)) add('restriction.extension', 'Absolutt frist må være en gyldig dato.');
    else if (end && item.valueDate < end.slice(0, 10)) add('restriction.extension', 'Absolutt frist kan ikke være før svarfristen.');
  }
  if (Array.isArray(task.note) && task.note.length) add('note', 'Notater støttes bare ved senere oppdatering, ikke ved opprettelse.');
  if (task.priority) add('priority', 'Prioritet benyttes ikke av Helsenorge.', 'warning');
  return issues;
}
