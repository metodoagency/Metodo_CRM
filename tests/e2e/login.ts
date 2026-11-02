import { expect, type Page } from '@playwright/test';
export async function signIn(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Test sahibiyle giriş yap' }).click();
  await expect(page.locator('main')).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  const settings = await (await page.request.get('/api/settings')).json();
  const result = await page.request.patch('/api/settings', { headers: { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken }, data: { version: settings.version, language: 'tr', theme: 'dark' } });
  expect(result.ok()).toBe(true); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await expect(page.locator('main')).toBeVisible();
}
