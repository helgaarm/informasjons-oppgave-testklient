import { test, expect, loadTask, confirmation, destination, sendButton } from './fixtures.js';

for (const failure of ['lost response', 'truncated JSON', 'invalid receipt']) {
  test(`${failure} after an accepted POST records uncertainty and blocks that identifier and area`, async ({ page, app }) => {
    const task = await loadTask(page);
    await page.route('**/api/tasks/send', async route => {
      // Let the real local backend accept the synthetic Task, then lose its response.
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      if (failure === 'lost response') return route.abort('failed');
      return route.fulfill({ response, contentType: 'application/json',
        body: failure === 'truncated JSON' ? '{"ok":true,' : '{"ok":"true","status":201,"environment":"test02"}' });
    });
    await confirmation(page).check();
    await sendButton(page).click();
    await expect(page.getByRole('alert')).toContainText('Leveringsstatus er ukjent. Kontroller Test02');
    await expect(page.locator('.response-panel')).toContainText('Ukjent leveringsstatus');
    await expect(page.locator('.response-panel')).toContainText('Oppgaven kan være mottatt');
    await expect(sendButton(page)).toBeDisabled();

    // Editing the content or switching away and back must not bypass the guard.
    await page.getByRole('textbox', { name: 'Beskrivelse *', exact: true }).fill('Rettet syntetisk beskrivelse');
    await confirmation(page).check();
    await expect(sendButton(page)).toBeDisabled();
    await destination(page).selectOption('test01');
    await confirmation(page).check();
    await expect(sendButton(page, 'Test01')).toBeEnabled();
    await destination(page).selectOption('test02');
    await confirmation(page).check();
    await expect(sendButton(page)).toBeDisabled();
    expect(app.calls).toHaveLength(1);
    expect(app.calls[0].task.identifier).toEqual(task.identifier);
    expect(app.calls[0].environment).toBe('test02');

    await page.getByRole('button', { name: /Innsendinger/ }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('Test02');
    await expect(page.locator('tbody tr')).toContainText('Ukjent levering');
    await expect(page.locator('tbody tr')).not.toContainText('Mottatt');
    await page.getByRole('button', { name: 'Informasjonsoppgave', exact: true }).click();
    await loadTask(page); // A different identifier is not blocked by this attempt.
    await confirmation(page).check();
    await expect(sendButton(page)).toBeEnabled();
    expect(app.calls).toHaveLength(1);
  });
}

test('an upstream rejection allows correction and resubmission with the same identifier', async ({ page, app }) => {
  const task = await loadTask(page);
  app.reject = true;
  await confirmation(page).check();
  await sendButton(page).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 422');
  await expect(page.locator('.response-panel')).not.toContainText('Ukjent leveringsstatus');
  await expect(sendButton(page)).toBeEnabled();
  app.reject = false;
  await page.getByRole('textbox', { name: 'Beskrivelse *', exact: true }).fill('Rettet syntetisk beskrivelse');
  await confirmation(page).check();
  await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Oppgaven er mottatt av Helsenorge Test02');
  await expect(sendButton(page)).toBeDisabled();
  expect(app.calls.map(call => call.task.identifier)).toEqual([task.identifier, task.identifier]);
  await page.getByRole('button', { name: /Innsendinger/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody tr').nth(0)).toContainText('Mottatt');
  await expect(page.locator('tbody tr').nth(1)).toContainText('Avvist');
});

test('a structured local validation error does not invent a delivery or block a corrected request', async ({ page, app }) => {
  await loadTask(page);
  await page.route('**/api/tasks/send', route => route.fulfill({ status: 422, json: {
    error: 'Oppgaven har valideringsfeil.', issues: [{ severity: 'error', path: 'description', message: 'Syntetisk valideringsfeil' }],
  } }), { times: 1 });
  await confirmation(page).check();
  await sendButton(page).click();
  await expect(page.getByRole('alert')).toContainText('Oppgaven har valideringsfeil');
  await expect(page.locator('.validation-panel')).toContainText('Syntetisk valideringsfeil');
  expect(app.calls).toHaveLength(0);
  await page.getByRole('button', { name: /Innsendinger/ }).click();
  await expect(page.getByRole('heading', { name: 'Ingen innsendinger i denne økten' })).toBeVisible();
  await page.getByRole('button', { name: 'Informasjonsoppgave', exact: true }).click();
  await page.getByRole('textbox', { name: 'Beskrivelse *', exact: true }).fill('Rettet syntetisk beskrivelse');
  await confirmation(page).check();
  await sendButton(page).click();
  await expect(page.getByRole('status')).toContainText('Oppgaven er mottatt');
  expect(app.calls).toHaveLength(1);
});
