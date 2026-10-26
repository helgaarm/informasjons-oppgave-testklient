import { afterEach, describe, expect, it, vi } from 'vitest';
import { postJson, requireSubmissionResult, UnconfirmedResponseError } from './api';
import { createStore, replaceTask, selectEnvironment } from './store';
import { exampleTask, setAt } from './task';
import type { Config } from './types';

const config = { csrf: 'synthetic-csrf' } as Config;
afterEach(() => vi.unstubAllGlobals());

describe('submission uncertainty', () => {
  it.each(['lost', 'html', 'null'])('treats %s responses as unknown delivery, without retrying', async failure => {
    const fetch = vi.fn().mockImplementation(() => failure === 'lost' ? Promise.reject(new Error('lost'))
      : Promise.resolve(new Response(failure === 'html' ? '<html>proxy</html>' : 'null', { status: 502 })));
    vi.stubGlobal('fetch', fetch);
    await expect(postJson('/api/tasks/send', { task: exampleTask(), environment: 'test02', confirmTestData: true }, config)).rejects.toBeInstanceOf(UnconfirmedResponseError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a receipt for a different test area', () => {
    expect(() => requireSubmissionResult({ ok: true, status: 201, environment: 'test01' }, 'test02')).toThrow(UnconfirmedResponseError);
  });
  it('preserves definitive validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Fix fields', issues: [{ path: 'status', severity: 'error', message: 'ready' }] }), { status: 422 })));
    await expect(postJson('/api/tasks/send', { task: exampleTask(), environment: 'test02', confirmTestData: true }, config)).rejects.toMatchObject({ message: 'Fix fields', issues: [{ path: 'status' }] });
  });
});

describe('Redux editor', () => {
  it('keeps independent stores and preserves the draft when switching area', () => {
    const first = createStore(), second = createStore();
    const task = exampleTask();
    first.dispatch(replaceTask(task));
    first.dispatch(selectEnvironment('test01'));
    expect(first.getState().editor).toEqual({ task, environmentId: 'test01' });
    expect(second.getState().editor.environmentId).toBe('test02');
    expect(second.getState().editor.task.description).toBe('');
  });
  it('updates nested fields immutably and refuses prototype paths', () => {
    const task = exampleTask();
    const next = setAt(task, ['code', 'text'], 'Updated');
    expect(next.code?.text).toBe('Updated');
    expect(task.code?.text).not.toBe('Updated');
    expect(() => setAt(task, ['__proto__', 'polluted'], true)).toThrow();
  });
});
