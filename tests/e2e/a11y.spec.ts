import { test, expect, type BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepareSignedInPage } from './login';

let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
test.beforeAll(async ({ request }) => {
  // Both scans use the same owner session. Keep the real authentication rate
  // limit independent of test count and runner speed.
  const login = await request.post('/auth/test', { headers: { origin: 'http://localhost:5173' }, data: { email: 'owner@example.com' } });
  expect(login.ok(), `Accessibility login returned ${login.status()}`).toBe(true);
  ({ cookies } = await request.storageState());
});

for (const language of ['tr', 'en']) test(`main routes have no serious or critical accessibility violations (${language})`, async ({ page }) => {
  test.setTimeout(90_000); // This scenario scans every main route.
  await page.context().addCookies(cookies);
  await prepareSignedInPage(page);
  await expect(page.locator('main')).toBeVisible();
  if (language === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const clubResponse = await page.request.post('/api/clubs', { headers, data: { name: `Örnek Erişilebilirlik ${language}` } });
  const playerResponse = await page.request.post('/api/players', { headers, data: { name: `Örnek Oyuncu Erişilebilirlik ${language}`, primaryPosition: 'CM' } });
  const personResponse = await page.request.post('/api/people', { headers, data: { name: `Örnek Kişi Erişilebilirlik ${language}` } });
  expect(clubResponse.status()).toBe(201); expect(playerResponse.status()).toBe(201); expect(personResponse.status()).toBe(201);
  const club = await clubResponse.json(); const player = await playerResponse.json(); const person = await personResponse.json();
  const membership = await page.request.post('/api/relations', { headers, data: {
    fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'memberOf',
  } });
  expect(membership.status()).toBe(201);
  const request = await page.request.post('/api/requests', { headers, data: {
    name: `Örnek Talep Erişilebilirlik ${language}`, clubId: club.id, requesterId: person.id, position: 'CM',
  } });
  expect(request.status()).toBe(201);
  const requestPath = `/record/Request/${(await request.json()).id}`;
  const paths = ['/', '/clubs', '/players', '/people', '/requests', '/proposals', '/sources', '/birthdays', '/trash', '/settings', '/privacy', '/incident',
    requestPath, `/record/Club/${club.id}`, `/record/Person/${person.id}`, `/record/Player/${player.id}`];
  for (const path of paths) {
    await page.goto(path); await expect(page.locator('main h1'), `${language} ${path}`).toBeVisible();
    if (path === '/clubs') await expect(page.locator('.club-map')).toBeVisible();
    if (path === '/birthdays') {
      await page.getByRole('button', { name: language === 'tr' ? 'Doğum günü hatırlatmaları' : 'Birthday reminders', exact: true }).click();
      await expect(page.getByRole('textbox', { name: language === 'tr' ? 'Hatırlatma eşikleri (gün)' : 'Reminder thresholds (days)' })).toBeVisible();
    }
    if (path.startsWith('/record/Club/')) await expect(page.getByRole('button', {
      name: language === 'tr' ? 'Kulüp bilgilerini düzenle' : 'Edit club information', exact: true,
    })).toBeEnabled();
    if (path.startsWith('/record/Player/')) await expect(page.getByRole('button', {
      name: language === 'tr' ? 'Piyasa değeri kaydet' : 'Record market value', exact: true,
    })).toBeEnabled();
    if (path.startsWith('/record/Person/')) await expect(page.getByRole('button', {
      name: language === 'tr' ? 'Kişi profilini düzenle' : 'Edit person profile', exact: true,
    })).toBeEnabled();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} ${path}`).toEqual([]);
    if (path === requestPath) {
      await page.getByRole('button', { name: language === 'tr' ? 'Oyuncuları değerlendir' : 'Evaluate players', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: language === 'tr' ? 'Oyuncu eşleştirme' : 'Player matching', exact: true });
      await expect(dialog.getByRole('link').first()).toBeVisible();
      const matches = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(matches.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} matches`).toEqual([]);
      await dialog.getByRole('button', { name: language === 'tr' ? 'Kapat' : 'Close', exact: true }).click();
    }
  }
  const dialogs = [
    { name: language === 'tr' ? 'Yazdırma önizlemesi' : 'Print preview', control: language === 'tr' ? 'Kartı yazdır' : 'Print card', role: 'button' },
    { name: language === 'tr' ? 'Genel bilgileri düzenle' : 'Edit general information', control: language === 'tr' ? 'Biyografi metni' : 'Biography text', role: 'textbox' },
  ] as const;
  for (const { name, control, role } of dialogs) {
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    await expect(dialog.getByRole(role, { name: control, exact: true })).toBeVisible();
    const result = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} ${name}`).toEqual([]);
    await dialog.getByRole('button', { name: language === 'tr' ? 'Kapat' : 'Close', exact: true }).click();
  }
});
