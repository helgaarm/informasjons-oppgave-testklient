import { test, expect, loadTask, confirmation, sendButton } from './fixtures';

test('unsaved connection settings survive navigation and saving clears the key', async ({ page }) => {
  let saved = { mode: 'test-token', configured: true, authenticated: false, missing: [], editable: true,
    parent: '123456789', child: '', audience: 'synthetic-audience', scope: 'synthetic-scope' };
  let saves = 0;
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({ response, json: { ...config, auth: saved } });
  });
  await page.route('**/api/auth/settings', async route => {
    const values = route.request().postDataJSON();
    expect(values.apiKey).toBe('synthetic-key-not-real');
    saves++;
    saved = { ...saved, parent: values.parent, audience: values.audience, scope: values.scope };
    await route.fulfill({ json: saved });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tilkobling', exact: true }).click();
  await page.locator('#connection-parent').fill('987654321');
  await page.locator('#connection-audience').fill('changed-synthetic-audience');
  await page.locator('#connection-apiKey').fill('synthetic-key-not-real');
  for (const name of ['Informasjonsoppgave', 'Innsendinger']) {
    await page.getByRole('button', { name: name === 'Innsendinger' ? /Innsendinger/ : name, exact: true }).click();
    await expect(page.locator('#connection-apiKey')).toBeHidden();
    await page.getByRole('button', { name: 'Tilkobling', exact: true }).click();
    await expect(page.locator('#connection-parent')).toHaveValue('987654321');
    await expect(page.locator('#connection-audience')).toHaveValue('changed-synthetic-audience');
    await expect(page.locator('#connection-apiKey')).toHaveValue('synthetic-key-not-real');
    await expect(page.getByRole('button', { name: 'Test tilkobling', exact: true })).toBeDisabled();
  }
  expect(saves).toBe(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Lagre oppsett', exact: true }).click();
  await expect(page.getByText('Oppsettet er lagret. Test tilkoblingen når du er klar.', { exact: true })).toBeVisible();
  await expect(page.locator('#connection-apiKey')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Test tilkobling', exact: true })).toBeEnabled();
  expect(saves).toBe(1);
  await page.getByRole('button', { name: 'Informasjonsoppgave', exact: true }).click();
  await page.getByRole('button', { name: 'Tilkobling', exact: true }).click();
  await expect(page.locator('#connection-parent')).toHaveValue('987654321');
  await expect(page.locator('#connection-apiKey')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Lagre oppsett', exact: true })).toBeDisabled();
});

for (const dirty of [false, true]) {
  test(`refreshed connection settings ${dirty ? 'preserve the unsaved draft' : 'update the clean form'}`, async ({ page }) => {
    let saved = { mode: 'test-token', configured: true, authenticated: false, missing: [], editable: true,
      parent: '123456789', child: '', audience: 'synthetic-audience', scope: 'synthetic-scope' };
    await page.route('**/api/config', async route => {
      const response = await route.fetch();
      const config = await response.json();
      await route.fulfill({ response, json: { ...config, auth: saved } });
    });
    await page.reload();
    await loadTask(page);
    await page.getByRole('button', { name: 'Tilkobling', exact: true }).click();
    await expect(page.locator('#connection-parent')).toHaveValue('123456789');
    if (dirty) {
      await page.locator('#connection-parent').fill('987654321');
      await page.locator('#connection-apiKey').fill('synthetic-unsaved-key');
    }
    await page.getByRole('button', { name: 'Informasjonsoppgave', exact: true }).click();
    saved = { ...saved, parent: '222222222', audience: 'refreshed-audience' };
    const refreshed = page.waitForResponse('**/api/config');
    await confirmation(page).check();
    await sendButton(page).click();
    await refreshed;
    await expect(page.getByRole('status')).toContainText('Oppgaven er mottatt');
    await page.getByRole('button', { name: 'Tilkobling', exact: true }).click();
    await expect(page.locator('#connection-parent')).toHaveValue(dirty ? '987654321' : '222222222');
    await expect(page.locator('#connection-audience')).toHaveValue(dirty ? 'synthetic-audience' : 'refreshed-audience');
    await expect(page.locator('#connection-apiKey')).toHaveValue(dirty ? 'synthetic-unsaved-key' : '');
    if (dirty) await expect(page.getByRole('button', { name: 'Test tilkobling', exact: true })).toBeDisabled();
    else await expect(page.getByRole('button', { name: 'Lagre oppsett', exact: true })).toBeDisabled();
  });
}
