// The two UIs share client-side rules. Authoritative server validation is C#/Firely.
import * as original from '../../../shared/task.js';
import type { JsonValue, TaskResource, ValidationIssue } from './types';
export const SYSTEMS = original.SYSTEMS;
export const AREAS: string[][] = original.AREAS;
export const newTask = (): TaskResource => ({ ...original.newTask(), resourceType: 'Task' });
export const exampleTask = (): TaskResource => ({ ...original.exampleTask(), resourceType: 'Task' });
export const getAt = (value: JsonValue, path: (string | number)[]): JsonValue | undefined => original.getAt(value, path);
export const setAt = (value: TaskResource, path: (string | number)[], next: JsonValue | undefined): TaskResource => original.setAt(value, path, next);
export const validateTask = (task: TaskResource): ValidationIssue[] => original.validateTask(task);
