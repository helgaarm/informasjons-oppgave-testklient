import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { createApp } from '../../server/app.js';
import { attachBrowserAssets } from '../../server/browser-assets.js';
import { exampleTask } from '../../shared/task.js';

// Import createApp directly: never load .env, saved settings, or a live client.
export const test = base.extend({
  app: async ({}, use) => {
    let app;
    const server = http.createServer((req, res) => app(req, res));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const state = { origin: `http://127.0.0.1:${server.address().port}`, calls: [], reject: false };
    try {
      app = createApp({ origin: state.origin, client: {
        status: () => ({ mode: 'test-token', configured: true, authenticated: false, missing: [] }),
        getToken: async () => { throw new Error('Authentication must not be called in browser regressions.'); },
        sendTask: async (task, correlationId, environment) => {
          state.calls.push({ task, environment });
          return { ok: !state.reject, status: state.reject ? 422 : 201, correlationId,
            receivedAt: new Date().toISOString(), body: state.reject ? { error: 'Synthetic rejection' } : { id: 'synthetic-receipt' } };
        },
      } });
      await attachBrowserAssets(app, { root: fileURLToPath(new URL('../../', import.meta.url)) });
      await use(state);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  },
  page: async ({ page, app }, use) => {
    const external = [], errors = [];
    await page.context().route('**/*', route => {
      if (new URL(route.request().url()).origin === app.origin) return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(app.origin);
    await expect(page.getByRole('button', { name: 'Last inn FHIR Task' })).toBeEnabled();
    await use(page);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  },
});

export { expect };

export async function loadTask(page) {
  const task = exampleTask();
  task.owner.identifier.value = '12345678901';
  await page.locator('input[type=file]').setInputFiles({
    name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(task)),
  });
  await expect(page.getByRole('status')).toContainText('synthetic.json er lastet inn');
  return task;
}

export const confirmation = page => page.getByRole('checkbox', { name: /Jeg har kontrollert mottaker/ });
export const destination = page => page.getByRole('combobox', { name: 'Testområde på Helsenorge' });
export const sendButton = (page, area = 'Test02') => page.getByRole('button', { name: `Send til ${area}`, exact: true });
