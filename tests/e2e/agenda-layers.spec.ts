import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';

test.use({ actionTimeout: 10000 });
for (const language of ['tr', 'en']) test(`agenda date layers keep birthdays private and expire a deliberate reveal (${language})`, async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const tr = language === 'tr';
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const name = `Örnek Katman ${language} ${Date.now()}`;
  const person = await (await page.request.post('/api/people', { headers, data: { name: name + ' Doğum', birthDate: '1990-11-20', hideBirthYear: true } })).json();
  const player = await (await page.request.post('/api/players', { headers, data: { name: name + ' Oyuncu', primaryPosition: 'CM', status: 'OWN' } })).json();
  const contractResponse = await page.request.post(`/api/players/${player.id}/contracts`, { headers, data: {
    name: name + ' Sözleşme', type: 'EMPLOYMENT', clubId: null, agentId: null, signedDate: null, startDate: '2026-01-01', endDate: '2026-11-20', isActive: true,
    salaryAmount: null, salaryCurrency: null, salaryPeriod: null, salaryBasis: null, bonuses: null, paymentDay: null, releaseClause: null, buyout: null, extensionOption: null,
    noticeDeadline: null, representation: null, documentLink: null, sourceUrl: 'https://example.com/contract', sourceDate: '2026-01-01', methodNote: 'Örnek elle kayıt',
  } }); expect(contractResponse.status()).toBe(201);
  if (!tr) await page.getByRole('button', { name: 'English', exact: true }).click();
  let reveals = 0; page.on('request', request => { if (request.url().endsWith('/api/agenda/birthdays/view')) reveals++; });
  await page.goto('/agenda'); await page.getByLabel(tr ? 'Ajanda tarihi' : 'Agenda date', { exact: true }).fill('2026-11-19');
  const contractLink = page.getByRole('link', { name: `${tr ? 'Sözleşme bitişi' : 'Contract ends'} · ${name} Sözleşme`, exact: true });
  await expect(contractLink).toBeVisible(); expect(reveals).toBe(0); await expect(page.getByText(person.name, { exact: false })).toHaveCount(0);
  await page.getByRole('checkbox', { name: tr ? 'Sözleşme tarihlerini göster' : 'Show contract dates', exact: true }).uncheck(); await expect(contractLink).toHaveCount(0);
  await page.getByRole('checkbox', { name: tr ? 'Sözleşme tarihlerini göster' : 'Show contract dates', exact: true }).check(); await expect(contractLink).toBeVisible();
  await page.clock.install();
  await page.getByRole('button', { name: tr ? 'Doğum günlerini 60 saniye göster' : 'Show birthdays for 60 seconds', exact: true }).click();
  const birthdayLink = page.getByRole('link', { name: `${tr ? 'Doğum günü' : 'Birthday'} · ${person.name}`, exact: true });
  await expect(birthdayLink).toBeVisible(); expect(reveals).toBe(1);
  const axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter(row => ['serious', 'critical'].includes(row.impact ?? ''))).toEqual([]);
  const ics = await page.request.post('/api/agenda/ics', { headers, data: { from: '2026-11-16', to: '2026-11-22' } }); expect(ics.status()).toBe(200); expect(await ics.text()).not.toContain(person.name); expect(await ics.text()).not.toContain('1990-11-20');
  await page.clock.fastForward(60001); await expect(birthdayLink).toHaveCount(0);
  await expect(page.getByText(tr ? /^Doğum günleri: \d+ kayıt/ : /^Birthdays: \d+ records/)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); expect(reveals).toBe(1); await expect(birthdayLink).toHaveCount(0);
});

test('late birthday replies stay hidden after hide/range changes and returning focus requires another explicit reveal', async ({ page }) => {
  test.setTimeout(90000);
  // Ignore abort only for this route in the test browser. The generation/mount
  // guard must still prevent a late successful response from reviving dates.
  await page.addInitScript(() => { const native = window.fetch; window.fetch = (input, init) => String(input).endsWith('/api/agenda/birthdays/view') ? native(input, { ...init, signal: undefined }) : native(input, init); });
  await signIn(page); const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const person = await (await page.request.post('/api/people', { headers, data: { name: `Örnek Geç Yanıt ${Date.now()}`, birthDate: '1990-11-20', hideBirthYear: true } })).json();
  let release = () => {}; let entered = () => {}; const held = new Promise<void>(resolve => { release = resolve; }); const started = new Promise<void>(resolve => { entered = resolve; });
  await page.route('**/api/agenda/birthdays/view', async route => { const response = await route.fetch(); const json = await response.json(); entered(); await held; await route.fulfill({ response, json }); });
  await page.goto('/agenda'); await page.getByLabel('Ajanda tarihi', { exact: true }).fill('2026-11-19');
  await page.getByRole('button', { name: 'Doğum günlerini 60 saniye göster', exact: true }).click(); await started;
  await page.getByRole('button', { name: 'Doğum günlerini gizle', exact: true }).click();
  await page.getByLabel('Ajanda tarihi', { exact: true }).fill('2026-12-19'); release(); await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('link', { name: 'Doğum günü · ' + person.name, exact: true })).toHaveCount(0);
  await page.getByLabel('Ajanda tarihi', { exact: true }).fill('2026-11-19');
  await expect(page.getByRole('link', { name: 'Doğum günü · ' + person.name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Doğum günlerini 60 saniye göster', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Doğum günü · ' + person.name, exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('link', { name: 'Doğum günü · ' + person.name, exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Doğum günleri: \d+ kayıt/)).toHaveCount(0);
});
