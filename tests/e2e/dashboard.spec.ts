import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';

test.use({ actionTimeout: 10000 });

for (const language of ['tr', 'en']) test(`dashboard layout survives reload, protects a stale draft and recovers from all hidden (${language})`, async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const tr = language === 'tr';
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const initial = await (await page.request.get('/api/settings')).json();
  expect((await page.request.patch('/api/settings', { headers, data: { version: initial.version, dashboardLayout: [] } })).status()).toBe(200); await page.reload();
  if (!tr) await page.getByRole('button', { name: 'English', exact: true }).click();
  const customize = page.getByRole('button', { name: tr ? 'Ana ekranı düzenle' : 'Customize dashboard', exact: true });
  const summary = tr ? 'Ofis özeti' : 'Office summary'; const followUps = tr ? 'Geciken sunum takipleri' : 'Overdue presentation follow-ups';
  await customize.click(); let dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: tr ? `${followUps}: göster` : `Show ${followUps}`, exact: true }).uncheck();
  const move = dialog.getByRole('button', { name: tr ? `${summary}: aşağı taşı` : `Move ${summary} down`, exact: true }); await move.focus(); await page.keyboard.press('Enter');
  const axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter(row => ['serious', 'critical'].includes(row.impact ?? ''))).toEqual([]);
  await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0); await page.reload();
  await expect(page.locator('[data-widget]').first()).toHaveAttribute('data-widget', 'todayTasks'); await expect(page.locator('[data-widget="followUps"]')).toHaveCount(0);
  await customize.click(); dialog = page.getByRole('dialog'); const visibleSummary = dialog.getByRole('checkbox', { name: tr ? `${summary}: göster` : `Show ${summary}`, exact: true }); await visibleSummary.uncheck();
  const current = await (await page.request.get('/api/settings')).json(); expect((await page.request.patch('/api/settings', { headers, data: { version: current.version, theme: 'light' } })).status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(visibleSummary).not.toBeChecked(); await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(tr ? 'Taslağınız korunuyor' : 'Your draft is preserved'); await expect(visibleSummary).not.toBeChecked();
  await dialog.getByRole('button', { name: tr ? 'Güncel düzeni yükle' : 'Load current layout', exact: true }).click(); await expect(visibleSummary).toBeChecked();
  for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.uncheck();
  await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0); await page.reload(); await expect(page.locator('[data-widget]')).toHaveCount(0); await expect(customize).toBeEnabled();
  await customize.click(); dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox', { name: tr ? `${summary}: göster` : `Show ${summary}`, exact: true }).check();
  await dialog.getByRole('button', { name: tr ? 'Vazgeç' : 'Cancel', exact: true }).click(); await expect(page.locator('[data-widget]')).toHaveCount(0);
  await customize.click(); dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox', { name: tr ? `${summary}: göster` : `Show ${summary}`, exact: true }).check(); await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); await expect(page.locator('[data-widget="summary"]')).toBeVisible();
  await customize.click(); dialog = page.getByRole('dialog'); const firstRow = dialog.locator('li').first(); const secondRow = dialog.locator('li').nth(1); const secondLabel = await secondRow.locator('label').innerText(); await secondRow.dragTo(firstRow); await expect(dialog.locator('li').first().locator('label')).toHaveText(secondLabel);
  await dialog.getByRole('button', { name: tr ? 'Vazgeç' : 'Cancel', exact: true }).click();
  const finalSettings = await (await page.request.get('/api/settings')).json(); expect((await page.request.patch('/api/settings', { headers, data: { version: finalSettings.version, dashboardLayout: [] } })).status()).toBe(200); await page.reload();
  const finalAxe = await new AxeBuilder({ page }).analyze(); expect(finalAxe.violations.filter(row => ['serious', 'critical'].includes(row.impact ?? ''))).toEqual([]);
});

test('a malformed legacy layout is flagged and a closed editor cannot close a new draft when its save finishes late', async ({ page }) => {
  test.setTimeout(60000); await signIn(page);
  await page.route('**/api/settings', async route => { if (route.request().method() !== 'GET') return route.continue(); const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), dashboardLayout: null } }); });
  await page.reload(); await expect(page.getByText('Kaydedilmiş düzen okunamadı;', { exact: false })).toBeVisible(); await page.unroute('**/api/settings'); await page.reload();
  let release = () => {}; let entered = () => {}; const held = new Promise<void>(resolve => { release = resolve; }); const submitted = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/api/settings', async route => { if (route.request().method() !== 'PATCH' || !route.request().postDataJSON().dashboardLayout) return route.continue(); const response = await route.fetch(); entered(); await held; await route.fulfill({ response }); });
  const customize = page.getByRole('button', { name: 'Ana ekranı düzenle', exact: true }); await customize.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet', exact: true }).click(); await submitted; await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await customize.click(); const dialog = page.getByRole('dialog'); const summary = dialog.getByRole('checkbox', { name: 'Ofis özeti: göster', exact: true }); await summary.uncheck();
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/settings') && response.request().method() === 'GET'); release(); await refreshed; await page.waitForLoadState('networkidle');
  await expect(dialog).toBeVisible(); await expect(summary).not.toBeChecked(); await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click(); await page.unroute('**/api/settings');
});
