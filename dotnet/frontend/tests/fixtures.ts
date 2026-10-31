import { test as base, expect, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exampleTask } from '../src/task';
import type { TaskResource } from '../src/types';

interface App { origin: string; calls: () => Promise<{ task: TaskResource; environment: string }[]>; setReject: (reject: boolean) => Promise<void> }
export const test = base.extend<{ app: App }>({
  app: async ({ request }, use) => {
    const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
    const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('No port');
    const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const root = await mkdtemp(join(tmpdir(), 'testklient-browser-'));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(HELSEID_|HOST$|PORT$|APP_ORIGIN$)/.test(key)) delete env[key];
    const child = spawn(process.env.DOTNET_EXE || 'dotnet', [resolve('../tests/Testklient.BrowserHost/bin/Debug/net10.0/Testklient.BrowserHost.dll'), String(port), root, resolve('dist')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    try {
      await expect.poll(async () => {
        if (child.exitCode !== null) throw new Error(`Test host exited: ${output}`);
        return request.get(origin + '/__test/ready').then(r => r.ok()).catch(() => false);
      }, { timeout: 20000 }).toBe(true);
      await use({ origin, calls: async () => (await request.get(origin + '/__test/state')).json(),
        setReject: async reject => { const response = await request.post(origin + '/__test/state', { data: { reject } }); expect(response.ok()).toBe(true); } });
    } finally {
      if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
      await rm(root, { recursive: true, force: true });
    }
  },
  page: async ({ page, app }, use) => {
    const external: string[] = [], errors: string[] = [];
    await page.context().route('**/*', route => {
      if (new URL(route.request().url()).origin === app.origin) return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(app.origin);
    await expect(page.getByRole('button', { name: 'Last inn FHIR Task' })).toBeEnabled();
    await use(page);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  },
});
export { expect };
export async function loadTask(page: Page) {
  const task = exampleTask(); task.owner!.identifier!.value = '12345678901';
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(task)) });
  await expect(page.getByRole('status')).toContainText('synthetic.json er lastet inn');
  return task;
}
export const confirmation = (page: Page) => page.getByRole('checkbox', { name: /Jeg har kontrollert mottaker/ });
export const destination = (page: Page) => page.getByRole('combobox', { name: 'Testområde på Helsenorge' });
export const sendButton = (page: Page, area = 'Test02') => page.getByRole('button', { name: `Send til ${area}`, exact: true });
