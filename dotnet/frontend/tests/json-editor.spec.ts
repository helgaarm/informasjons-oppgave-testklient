import { test, expect, loadTask, confirmation, destination, sendButton } from './fixtures';

test('applying JSON locks editing and replacement until the response, including double clicks', async ({ page }) => {
  const task = await loadTask(page);
  await confirmation(page).check();
  await page.getByRole('tab', { name: /JSON/ }).click();
  const editor = page.getByRole('textbox', { name: 'FHIR Task JSON' });
  task.description = 'Endring fra JSON';
  const draft = JSON.stringify(task, null, 2);
  await editor.fill(draft);
  let release!: () => void, started!: () => void, imports = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/tasks/import', async route => {
    imports++;
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: 'Bruk JSON', exact: true }).dblclick();
    await entered;
    await expect(editor).toBeDisabled();
    await expect(editor).toHaveValue(draft);
    for (const name of ['Behandler JSON …', 'Forkast JSON-endringer', 'Ny oppgave', 'Last inn FHIR Task', 'Last ned JSON', 'Bruk et eksempel', 'Valider']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await expect(destination(page)).toBeDisabled();
    await expect(confirmation(page)).toBeDisabled();
    await expect(sendButton(page)).toBeDisabled();
    // An attempted replacement from a file picker opened earlier is ignored too.
    await page.locator('input[type=file]').setInputFiles({ name: 'late.json', mimeType: 'application/json', buffer: Buffer.from(draft) });
    expect(imports).toBe(1);
  } finally { release(); }
  await expect(page.getByRole('status')).toContainText('JSON-endringene er brukt');
  await expect(editor).toBeEnabled();
  expect(imports).toBe(1);
  await expect(confirmation(page)).not.toBeChecked();
  await page.getByRole('tab', { name: '01 Oppgave', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Beskrivelse *', exact: true })).toHaveValue(task.description);
  await page.getByRole('textbox', { name: 'Beskrivelse *', exact: true }).fill('Nyere endring etter behandling');
  await page.getByRole('tab', { name: /JSON/ }).click();
  expect(JSON.parse(await editor.inputValue()).description).toBe('Nyere endring etter behandling');
});

test('failed JSON import preserves the draft and original task, and unlocks correction and retry', async ({ page }) => {
  const task = await loadTask(page);
  await page.getByRole('tab', { name: /JSON/ }).click();
  const editor = page.getByRole('textbox', { name: 'FHIR Task JSON' });
  const apply = page.getByRole('button', { name: 'Bruk JSON', exact: true });
  await editor.fill('{"resourceType":"Task",');
  await apply.click();
  await expect(page.getByRole('alert')).toContainText('JSON kunne ikke brukes');
  await expect(editor).toHaveValue('{"resourceType":"Task",');
  await expect(editor).toBeEnabled();
  await expect(apply).toBeEnabled();
  await page.getByRole('button', { name: 'Forkast JSON-endringer' }).click();
  expect(JSON.parse(await editor.inputValue())).toEqual(task);
  task.description = 'Rettet JSON';
  await editor.fill(JSON.stringify(task));
  await apply.click();
  await expect(page.getByRole('status')).toContainText('JSON-endringene er brukt');
  expect(JSON.parse(await editor.inputValue()).description).toBe('Rettet JSON');
});
