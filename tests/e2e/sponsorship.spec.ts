import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';
import { tr, en } from '../../shared/locales';

for (const language of ['tr', 'en']) test(`owner manages brand contacts and preserves a stale draft (${language})`, async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const words = language === 'tr' ? tr : en;
  const headers = { origin: process.env.APP_ORIGIN ?? 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const suffix = `${language} ${Date.now()}`; const name = `Örnek Marka ${suffix}`; const personName = `Örnek Marka Kişisi ${suffix}`;
  const createdPerson = await page.request.post('/api/people', { headers, data: { name: personName } }); expect(createdPerson.status()).toBe(201); const person = await createdPerson.json();
  if (language === 'en') { await page.getByRole('button', { name: 'English', exact: true }).click(); const settings = await (await page.request.get('/api/settings')).json(); expect((await page.request.patch('/api/settings', { headers, data: { version: settings.version, theme: 'light' } })).ok()).toBe(true); await page.reload(); await page.setViewportSize({ width: 390, height: 844 }); }
  await page.goto('/sponsorship'); const outbound: string[] = []; page.on('request', request => { if (new URL(request.url()).hostname === 'example.com') outbound.push(request.url()); });
  await page.getByRole('button', { name: words.brandAdd, exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel(words.brandName, { exact: true }).fill(name); await dialog.getByLabel(words.brandSector, { exact: true }).fill('Örnek Spor'); await dialog.getByLabel(words.brandWebsite, { exact: true }).fill('https://example.com/brand');
  await dialog.getByLabel(words.brandExample, { exact: true }).check();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  await dialog.getByRole('button', { name: words.save, exact: true }).click(); await expect(dialog).toBeHidden(); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('brand')!;
  await page.getByRole('button', { name: words.brandContactAdd, exact: true }).click();
  await dialog.getByRole('textbox').first().fill(personName); await dialog.getByRole('textbox').first().press('Enter'); await dialog.getByRole('combobox').selectOption(person.id);
  await dialog.getByLabel(words.brandContactRole, { exact: true }).fill('Örnek Pazarlama'); await dialog.getByLabel(words.brandContactStart, { exact: true }).fill('2026-01-01');
  await dialog.getByRole('button', { name: words.save, exact: true }).click(); await expect(dialog).toBeHidden(); await expect(page.getByRole('link', { name: personName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: words.brandEdit, exact: true }).click(); const field = dialog.getByLabel(words.brandSector, { exact: true }); await field.fill('Örnek Korunan Taslak');
  const current = await (await page.request.get(`/api/brands/${id}`)).json(); expect((await page.request.patch(`/api/brands/${id}`, { headers, data: { version: current.version, changes: { sector: 'Örnek Başka Sekme' } } })).ok()).toBe(true);
  await page.clock.install(); await page.clock.fastForward(15_001);
  const refetch = page.waitForResponse(reply => reply.url().endsWith(`/api/brands/${id}`) && reply.request().method() === 'GET'); await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))); await refetch; await page.clock.resume(); await expect(field).toHaveValue('Örnek Korunan Taslak');
  const stale = page.waitForResponse(reply => reply.url().endsWith(`/api/brands/${id}`) && reply.request().method() === 'PATCH'); await dialog.getByRole('button', { name: words.save, exact: true }).click(); expect((await stale).status()).toBe(409); await expect(field).toHaveValue('Örnek Korunan Taslak'); await expect(dialog.getByRole('alert')).toContainText(words.brandConflict); await page.keyboard.press('Escape');
  expect((await (await page.request.get(`/api/brands/${id}`)).json()).sector).toBe('Örnek Başka Sekme');
  const pageAxe = await new AxeBuilder({ page }).analyze(); expect(pageAxe.violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]); expect(outbound).toEqual([]);
  await page.getByRole('button', { name: words.brandDelete, exact: true }).click(); await dialog.getByRole('button', { name: words.brandDelete, exact: true }).click(); await expect(dialog).toBeHidden();
  expect((await page.request.get(`/api/brands/${id}`)).status()).toBe(404); expect((await page.request.get(`/api/records/Person/${person.id}`)).status()).toBe(200);
  const trash = (await (await page.request.get('/api/trash')).json()).find((item: { entityId: string }) => item.entityId === id);
  expect((await page.request.post(`/api/trash/${trash.id}/restore`, { headers, data: { version: trash.version, recordVersion: trash.recordVersion } })).ok()).toBe(true);
  await page.goto(`/sponsorship?brand=${id}`); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: personName, exact: true })).toBeVisible();
});
