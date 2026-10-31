import { test, expect, loadTask } from './fixtures';

test('Firely field metadata supports editing, validation and JSON export without losing extensions', async ({ page }) => {
  await loadTask(page);
  await page.getByRole('tab', { name: /JSON/ }).click();
  const editor = page.getByRole('textbox', { name: 'FHIR Task JSON' });
  const task = JSON.parse(await editor.inputValue());
  task.extension = [{ url: 'https://example.org/synthetic-extension', valueString: 'preserved' }];
  await editor.fill(JSON.stringify(task));
  await page.getByRole('button', { name: 'Bruk JSON', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('JSON-endringene er brukt');
  await page.getByRole('tab', { name: /Alle FHIR-felt/ }).click();
  const add = page.getByRole('combobox', { name: 'Nytt felt i Task', exact: true });
  await add.selectOption('language');
  await add.locator('..').getByRole('button', { name: 'Legg til', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task.language', exact: true }).fill('nb');
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Lokal FHIR-struktur');
  await page.getByRole('tab', { name: /JSON/ }).click();
  const result = JSON.parse(await editor.inputValue());
  expect(result.language).toBe('nb');
  expect(result.extension).toEqual(task.extension);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Last ned JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('informasjonsoppgave-test02.json');
});

test('task tabs, connection and history fit narrow and wide screens', async ({ page }, testInfo) => {
  test.slow();
  await loadTask(page);
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ['task', 'connection', 'history']) {
      await page.getByRole('navigation', { name: 'Hovedmeny' }).getByRole('button', {
        name: view === 'task' ? 'Informasjonsoppgave' : view === 'connection' ? 'Tilkobling' : /Innsendinger/,
      }).click();
      const tabs = view === 'task' ? await page.getByRole('tablist', { name: 'Oppgavefelter' }).getByRole('tab').all() : [null];
      for (const tab of tabs) {
        if (tab) await tab.click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${view} at ${width}px`).toBeLessThanOrEqual(1);
      }
      if (width === 390 || width === 1440) {
        if (view === 'task') await page.getByRole('tablist', { name: 'Oppgavefelter' }).getByRole('tab').first().click();
        await page.screenshot({ path: testInfo.outputPath(`${view}-${width}.png`), fullPage: true });
      }
    }
  }
});
