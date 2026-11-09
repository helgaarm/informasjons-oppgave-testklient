import { test, expect, loadTask, confirmation, destination, sendButton } from './fixtures';

for (const outcome of ['accepted', 'unknown']) {
  test(`${outcome} delivery remains blocked after importing equivalent UUID spellings`, async ({ page, app }) => {
    const task = await loadTask(page);
    if (outcome === 'unknown') {
      await page.route('**/api/tasks/send', async route => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort('failed');
      });
    }
    await confirmation(page).check();
    await sendButton(page).click();
    if (outcome === 'unknown') await expect(page.getByRole('alert')).toContainText('Leveringsstatus er ukjent');
    else await expect(page.getByRole('status')).toContainText('Oppgaven er mottatt');
    const uuid = task.identifier![0].value!.replace(/^urn:uuid:/i, '');
    for (const value of [`URN:UUID:${uuid.toUpperCase()}`, uuid, uuid.toUpperCase()]) {
      task.identifier = [{ system: 'urn:ietf:rfc:3986', value: 'urn:oid:1.2.3.1' },
        { system: 'urn:ietf:rfc:3986', value }];
      await page.locator('input[type=file]').setInputFiles({
        name: 'equivalent.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(task)),
      });
      await expect(page.getByRole('status')).toContainText('equivalent.json er lastet inn');
      await confirmation(page).check();
      await expect(sendButton(page)).toBeDisabled();
    }
    await destination(page).selectOption('test01');
    await confirmation(page).check();
    await expect(sendButton(page, 'Test01')).toBeEnabled();
    await destination(page).selectOption('test02');
    await confirmation(page).check();
    await expect(sendButton(page)).toBeDisabled();
    expect((await app.calls())).toHaveLength(1);
  });
}
