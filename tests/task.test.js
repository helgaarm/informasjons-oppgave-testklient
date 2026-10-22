import test from 'node:test';
import assert from 'node:assert/strict';
import { Fhir } from 'fhir-tool';
import { exampleTask, setAt, SYSTEMS } from '../shared/task.js';
import { importTask, validateResource, fieldSchema } from '../server/fhir.js';

export function validTask() { const task = exampleTask(); task.owner.identifier.value = '12345678901'; return task; }
test('NHN information task uses owner, Communication, contained requester and restriction', () => {
  const task = validTask();
  assert.deepEqual(validateResource(task).filter(i => i.severity === 'error'), []);
  task.for = task.owner; delete task.owner;
  assert.ok(validateResource(task).some(i => i.path === 'owner.identifier.value'));
});
test('JSON import and field editing retain unknown data, extensions, additional identifiers and resources', () => {
  const task = validTask();
  task.extension = [{ url: 'https://example.org/custom', valueBoolean: true }];
  task.identifier.push({ system: 'https://example.org/id', value: 'external-123' });
  task.contained.unshift({ resourceType: 'Organization', id: 'other', name: 'Other organization' });
  task.customUnknownField = { nested: [false, 42, 'keep'] };
  const imported = importTask(JSON.stringify(task));
  const edited = setAt(imported, ['code', 'text'], 'Endret tittel');
  assert.deepEqual(edited.extension, task.extension);
  assert.deepEqual(edited.identifier, task.identifier);
  assert.deepEqual(edited.contained, task.contained);
  assert.deepEqual(edited.customUnknownField, task.customUnknownField);
  assert.notEqual(imported.code.text, edited.code.text);
  assert.ok(validateResource(edited).some(i => i.severity === 'error')); // Unknown FHIR fields cannot silently be sent.
});
test('XML import preserves typed values and repeated content', () => {
  const task = validTask();
  task.extension = [{ url: 'https://example.org/check', valueBoolean: false }];
  task.contained[0].contact = [{ telecom: [{ system: 'phone', value: '+4700000000' }, { system: 'email', value: 'test@example.org' }] }];
  assert.deepEqual(importTask(new Fhir().objToXml(task)), task);
});
test('unsafe imports and incorrect types are rejected without replacing a draft', () => {
  assert.throws(() => importTask('{"resourceType":"Task","__proto__":{"polluted":true}}'));
  assert.throws(() => importTask('<!DOCTYPE Task [<!ENTITY x "x">]><Task/>'));
  assert.throws(() => importTask('{"resourceType":"Bundle"}'));
  assert.throws(() => importTask('{"resourceType":"Task","code":{"text":{}}}'));
  assert.throws(() => importTask('{"resourceType":"Task","contained":{}}'));
  assert.throws(() => importTask('x'.repeat(1024 * 1024 + 1)));
});
test('NHN rules reject unsupported initial statuses, missing metadata, dates and notes', () => {
  const task = validTask();
  task.status = 'completed'; task.intent = 'order'; task.focus.type = 'Questionnaire';
  task.meta.security = []; task.code.text = 'x'.repeat(251); task.restriction.period.end = 'bad';
  task.note = [{ text: 'not allowed at creation' }];
  const errors = validateResource(task).filter(i => i.severity === 'error');
  for (const path of ['status', 'intent', 'focus.type', 'meta.security', 'code.text', 'restriction.period.end', 'note']) assert.ok(errors.some(i => i.path === path), path);
});
test('deadline cannot precede due date and requester reference must resolve', () => {
  const task = validTask(); task.requester.reference = '#missing';
  task.restriction.extension = [{ url: SYSTEMS.deadline, valueDate: '2000-01-01' }];
  const issues = validateResource(task);
  assert.ok(issues.some(i => i.path === 'restriction.extension'));
  assert.ok(issues.some(i => i.path === 'requester'));
});
test('impossible calendar dates are not silently normalized', () => {
  const task = validTask(); task.restriction.period.end = '2027-02-31';
  assert.ok(validateResource(task).some(i => i.path === 'restriction.period.end' && i.severity === 'error'));
});
test('field schema includes all Task properties and typed choice fields', () => {
  const schema = fieldSchema();
  for (const name of ['input', 'output', 'restriction', 'extension', 'meta', 'basedOn', 'owner', 'requester', 'reasonCode', 'contained']) assert.ok(schema.Task.some(p => p.name === name), name);
  const input = schema.Task.find(p => p.name === 'input');
  assert.ok(input.properties.some(p => p.name === 'valueBoolean' && p.type === 'boolean'));
  assert.ok(input.properties.some(p => p.name === 'valueCodeableConcept'));
});
test('removing optional fields prunes empty containers and supports sparse creation', () => {
  let task = setAt(validTask(), ['contained', 0, 'contact', 0, 'purpose', 'text'], 'Kontakt');
  assert.ok(Array.isArray(task.contained[0].contact));
  task = setAt(task, ['contained', 0, 'contact', 0, 'purpose', 'text'], undefined);
  assert.equal(task.contained[0].contact, undefined);
  assert.throws(() => setAt(task, ['__proto__', 'x'], true));
});
