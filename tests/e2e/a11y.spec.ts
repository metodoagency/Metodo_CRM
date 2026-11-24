import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';

for (const language of ['tr', 'en']) test(`main routes have no serious or critical accessibility violations (${language})`, async ({ page }) => {
  test.setTimeout(180_000); // Includes contract detail, editor and compliance view.
  // One session per language preserves the real300/minute session limit.
  // This isolated project performs only two authentication requests.
  await signIn(page);
  await expect(page.locator('main')).toBeVisible();
  if (language === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const clubResponse = await page.request.post('/api/clubs', { headers, data: { name: `Örnek Erişilebilirlik ${language}` } });
  const playerResponse = await page.request.post('/api/players', { headers, data: { name: `Örnek Oyuncu Erişilebilirlik ${language}`, primaryPosition: 'CM', status: 'OWN' } });
  const personResponse = await page.request.post('/api/people', { headers, data: { name: `Örnek Kişi Erişilebilirlik ${language}` } });
  expect(clubResponse.status()).toBe(201); expect(playerResponse.status()).toBe(201); expect(personResponse.status()).toBe(201);
  const club = await clubResponse.json(); const player = await playerResponse.json(); const person = await personResponse.json();
  const contractResponse = await page.request.post(`/api/players/${player.id}/contracts`, { headers, data: {
    name: `Örnek Erişilebilir Sözleşme ${language}`, type: 'EMPLOYMENT', clubId: club.id, agentId: null,
    signedDate: null, startDate: '2026-01-01', endDate: '2028-06-30', isActive: true,
    salaryAmount: null, salaryCurrency: null, salaryPeriod: null, salaryBasis: null, bonuses: null, paymentDay: 31,
    releaseClause: null, buyout: null, extensionOption: null, noticeDeadline: null, representation: null, documentLink: null,
    sourceUrl: 'https://example.com/contract', sourceDate: '2026-01-01', methodNote: 'Örnek elle kayıt',
  } });
  expect(contractResponse.status()).toBe(201); const contractPath = `/contracts/${(await contractResponse.json()).id}`;
  const taskResponse = await page.request.post('/api/tasks', { headers, data: {
    name: `Örnek Erişilebilir Görev ${language}`, priority: 'HIGH', dueDate: '2028-01-31', recurrence: 'MONTHLY', linkedEntity: { type: 'Player', id: player.id },
  } });
  expect(taskResponse.status()).toBe(201); const taskPath = `/tasks?task=${(await taskResponse.json()).id}`;
  const meetingResponse = await page.request.post('/api/meetings', { headers, data: { name: `Örnek Erişilebilir Görüşme ${language}`, date: '2026-11-19', time: '10:00', durationMin: 60, utcOffsetSeconds: null, participants: [{ type: 'Person', id: person.id }], locationOrUrl: null, agenda: '', notes: '', outcome: null } });
  expect(meetingResponse.status()).toBe(201); const meetingPath = `/agenda?meeting=${(await meetingResponse.json()).id}`;
  const membership = await page.request.post('/api/relations', { headers, data: {
    fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'memberOf',
  } });
  expect(membership.status()).toBe(201);
  const request = await page.request.post('/api/requests', { headers, data: {
    name: `Örnek Talep Erişilebilirlik ${language}`, clubId: club.id, requesterId: person.id, position: 'CM',
  } });
  expect(request.status()).toBe(201);
  const requestPath = `/record/Request/${(await request.json()).id}`;
  const paths = ['/', '/clubs', '/players', '/people', '/requests', '/proposals', '/sources', '/sponsorship', '/birthdays', '/presentations', '/trash', '/settings', '/privacy', '/incident',
    '/contracts', contractPath, '/notifications', '/tasks', taskPath, '/agenda', meetingPath, requestPath, `/record/Club/${club.id}`, `/record/Person/${person.id}`, `/record/Player/${player.id}`];
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
    if (path === contractPath) {
      await page.getByRole('button', { name: language === 'tr' ? 'Sözleşmeyi düzenle' : 'Edit contract', exact: true }).click();
      await expect(page.getByRole('dialog').getByLabel(language === 'tr' ? 'Sözleşme adı' : 'Contract name', { exact: true })).toBeVisible();
      const form = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(form.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} contract editor`).toEqual([]);
      await page.getByRole('dialog').getByRole('button', { name: language === 'tr' ? 'Kapat' : 'Close', exact: true }).click();
      await page.getByRole('button', { name: language === 'tr' ? 'Yaşa bağlı kontrol listesini göster' : 'Show age-related checklist', exact: true }).click();
      await expect(page.getByText(language === 'tr' ? 'Doğum tarihi eksik veya geçersiz; yaşa bağlı kontrol yapılamıyor.' : 'Birth date is missing or invalid; the age-related check is unavailable.', { exact: true })).toBeVisible();
      const compliance = await new AxeBuilder({ page }).analyze();
      expect(compliance.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} contract compliance`).toEqual([]);
    }
    if (path === '/presentations') {
      for (const title of language === 'tr' ? ['Kulüp × oyuncu', 'Kişi × oyuncu'] : ['Club × player', 'Person × player']) {
        await page.getByRole('button', { name: title, exact: true }).click();
        await expect(page.getByRole('textbox', { name: language === 'tr' ? 'Oyuncu adına göre ara' : 'Search by player name' })).toBeVisible();
        const matrix = await new AxeBuilder({ page }).analyze();
        expect(matrix.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} ${title}`).toEqual([]);
      }
      await page.getByRole('button', { name: language === 'tr' ? 'Sunum kaydet' : 'Log presentation', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel(language === 'tr' ? 'Takip tarihi' : 'Follow-up date', { exact: true })).toBeVisible();
      const form = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(form.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} presentation editor`).toEqual([]);
      await dialog.getByRole('button', { name: language === 'tr' ? 'Kapat' : 'Close', exact: true }).click();
    }
    if (path.startsWith('/record/Club/')) {
      await page.goto(`${path}?tab=players`);
      await expect(page.getByRole('button', { name: language === 'tr' ? 'Satış kaydı ekle' : 'Add sales listing', exact: true })).toBeVisible();
      const sales = await new AxeBuilder({ page }).analyze();
      expect(sales.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${language} club sales`).toEqual([]);
    }
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
