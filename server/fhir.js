import { Fhir } from 'fhir-tool';
import { assertSafeObject, parseTaskJson, validateTask } from '../shared/task.js';

const fhir = new Fhir(); // Bundled HL7 FHIR R4 4.0.1 base definitions.
export function checkEditableStructure(task) {
  assertSafeObject(task);
  function visit(value, def, path) {
    if (def._multiple) {
      if (!Array.isArray(value)) throw new Error(`${path} må være en liste.`);
      for (const item of value) visit(item, { ...def, _multiple: false }, path);
      return;
    }
    const type = def._type;
    const typeSchema = fhir.parser.parsedStructureDefinitions[type];
    const properties = typeSchema?._kind === 'primitive-type' ? [] : def._properties?.length ? def._properties : typeSchema?._properties;
    if (type === 'Resource' || properties?.length) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} må være et objekt.`);
      const children = type === 'Resource' ? fhir.parser.parsedStructureDefinitions[value.resourceType]?._properties : properties;
      for (const [key, child] of Object.entries(value)) {
        const childDef = children?.find(p => p._name === key);
        if (childDef) visit(child, childDef, `${path}.${key}`);
      }
    } else {
      const expected = type === 'boolean' ? 'boolean' : ['decimal', 'integer', 'positiveInt', 'unsignedInt'].includes(type) ? 'number' : 'string';
      if (value !== null && typeof value !== expected) throw new Error(`${path} har feil datatype (forventet ${expected}).`);
    }
  }
  visit(task, { _type: 'Task' }, 'Task');
}
export function validateResource(task) {
  const issues = validateTask(task);
  if (issues.some(i => i.path === 'Task' || i.path === 'resourceType')) return issues;
  try {
    checkEditableStructure(task);
    const result = fhir.validate(task, { errorOnUnexpected: true, skipCodeValidation: true });
    issues.push(...result.messages.filter(i => ['error', 'fatal'].includes(i.severity)).map(i => ({
      path: i.location || 'Task', message: i.message, severity: 'error', source: 'FHIR R4',
    })));
  } catch { issues.push({ path: 'Task', message: 'FHIR-strukturen kunne ikke valideres. Kontroller datatyper og lister.', severity: 'error' }); }
  return issues;
}
export function importTask(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024) throw new Error('Velg en JSON- eller XML-fil på maksimalt 1 MB.');
  if (!text.trim().startsWith('<')) { const task = parseTaskJson(text); checkEditableStructure(task); return task; }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML med DTD eller egendefinerte entiteter støttes ikke.');
  const validation = fhir.validate(text, { errorOnUnexpected: true, skipCodeValidation: true });
  if (!validation.valid) throw new Error('XML-filen har ugyldig FHIR-struktur. Kontroller feltnavn, datatyper og obligatoriske FHIR-felt.');
  const task = fhir.xmlToObj(text);
  assertSafeObject(task);
  if (task.resourceType !== 'Task') throw new Error('Filen må inneholde én FHIR Task.');
  checkEditableStructure(task);
  return task;
}
export function fieldSchema() {
  const schemas = fhir.parser.parsedStructureDefinitions;
  const result = {};
  const resources = ['Task', 'Organization', 'Practitioner', 'Patient'];
  function compact(properties) {
    return (properties ?? []).map(p => ({ name: p._name, type: p._type,
      multiple: !!p._multiple, required: !!p._required, ...(p._choice ? { choice: p._choice } : {}),
      ...(p._properties?.length ? { properties: compact(p._properties) } : {}) }));
  }
  for (const [name, schema] of Object.entries(schemas)) {
    if (schema._kind !== 'resource' || resources.includes(name)) result[name] = schema._kind === 'primitive-type' ? [] : compact(schema._properties);
  }
  return result;
}
