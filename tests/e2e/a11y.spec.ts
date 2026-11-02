import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';

for (const language of ['tr', 'en']) test(`main routes have no serious or critical accessibility violations (${language})`, async ({ page }) => {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  if (language === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  for (const path of ['/', '/clubs', '/players', '/people', '/requests', '/proposals', '/trash', '/settings']) {
    await page.goto(path); await expect(page.locator('main h1')).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} ${path}`).toEqual([]);
  }
});
