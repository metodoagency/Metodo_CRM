import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';

for (const language of ['tr', 'en']) test(`main routes have no serious or critical accessibility violations (${language})`, async ({ page }) => {
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  if (language === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  const me = await (await page.request.get('/api/me')).json();
  const record = await (await page.request.post('/api/clubs', { headers: { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken }, data: { name: `Örnek Erişilebilirlik ${language}` } })).json();
  for (const path of ['/', '/clubs', '/players', '/people', '/requests', '/proposals', '/trash', '/settings', '/privacy', '/incident', `/record/Club/${record.id}`]) {
    await page.goto(path); await expect(page.locator('main h1')).toBeVisible();
    if (path === '/clubs') await expect(page.locator('.club-map')).toBeVisible();
    if (path.startsWith('/record/Club/')) await expect(page.getByRole('button', {
      name: language === 'tr' ? 'Kulüp bilgilerini düzenle' : 'Edit club information', exact: true,
    })).toBeEnabled();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} ${path}`).toEqual([]);
  }
});
