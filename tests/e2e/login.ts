import { expect, type Page } from '@playwright/test';
export async function signIn(page: Page) {
  // UI sign-in is exercised by the first-login privacy scenarios. Other flows
  // establish their own session before navigation, avoiding repeated status
  // probes while retaining the real authentication rate limits.
  const login = await page.request.post('/auth/test', { headers: { origin: 'http://localhost:5173' }, data: { email: 'owner@example.com' } });
  expect(login.ok()).toBe(true); await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  const settings = await (await page.request.get('/api/settings')).json();
  const result = await page.request.patch('/api/settings', { headers: { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken }, data: { version: settings.version, language: 'tr', theme: 'dark' } });
  expect(result.ok()).toBe(true); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  const privacy = await (await page.request.get('/api/privacy')).json();
  if (privacy.acknowledgementRequired) {
    await page.getByRole('checkbox', { name: 'Bu sürümdeki bilgilendirmeyi okudum.' }).check();
    await page.getByRole('button', { name: 'Okundu olarak kaydet ve devam et' }).click();
  }
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ofisiniz, bir bakışta.' })).toBeVisible();
}
