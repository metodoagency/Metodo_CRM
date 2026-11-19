import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';
import { istanbulToday } from '../../shared/domain';

for (const language of ['tr', 'en']) test(`contract notification center supports read, snooze and stale protection (${language})`, async ({ page }) => {
  await signIn(page);
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const player = await (await page.request.post('/api/players', { headers, data: { name: `Örnek Bildirim Oyuncusu ${Date.now()}`, primaryPosition: 'CM', status: 'OWN' } })).json();
  const name = `Örnek Bildirim Sözleşmesi ${Date.now()}`;
  const contract = await page.request.post(`/api/players/${player.id}/contracts`, { headers, data: {
    name, type: 'EMPLOYMENT', clubId: null, agentId: null, signedDate: null, startDate: '2020-01-01', endDate: istanbulToday(), isActive: true,
    salaryAmount: '778899.99', salaryCurrency: 'EUR', salaryPeriod: 'YEAR', salaryBasis: 'GROSS', bonuses: null, paymentDay: null,
    releaseClause: null, buyout: null, extensionOption: null, noticeDeadline: null, representation: null, documentLink: null,
    sourceUrl: 'https://example.com/notification', sourceDate: istanbulToday(), methodNote: 'Örnek elle kontrol',
  } });
  expect(contract.status()).toBe(201);
  expect((await page.request.post('/api/contracts/reminders', { headers })).ok()).toBe(true);
  if (language === 'en') await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await page.getByRole('link', { name: language === 'tr' ? 'Bildirimler' : 'Notifications', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: language === 'tr' ? 'Bildirim merkezi' : 'Notification center', exact: true })).toBeVisible();
  const rows = page.locator('main li').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('778899.99')).toHaveCount(0);
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''));
  expect(violations).toEqual([]);
  await rows.first().getByRole('button', { name: language === 'tr' ? '1 gün ertele' : 'Snooze 1 day', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: language === 'tr' ? 'Ertelenmiş' : 'Snoozed', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole('button', { name: language === 'tr' ? '7 gün ertele' : 'Snooze 7 days', exact: true }).click();
  await expect(rows.first().getByRole('button', { name: language === 'tr' ? 'Okundu işaretle' : 'Mark as read', exact: true })).toBeEnabled();
  await rows.first().getByRole('button', { name: language === 'tr' ? 'Okundu işaretle' : 'Mark as read', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: language === 'tr' ? 'Okunmuş' : 'Read', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('button', { name: language === 'tr' ? 'Okundu işaretle' : 'Mark as read', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: language === 'tr' ? 'Okunmamış' : 'Unread', exact: true }).click();
  await expect(rows).toHaveCount(2);
  const item = (await (await page.request.get('/api/notifications')).json()).items.find((row: { name: string }) => row.name === name);
  expect((await page.request.patch(`/api/notifications/${item.id}`, { headers, data: { version: item.version, action: 'read' } })).ok()).toBe(true);
  await rows.first().getByRole('button', { name: language === 'tr' ? 'Okundu işaretle' : 'Mark as read', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(language === 'tr' ? 'Bildirim veya bağlı kayıt değişti' : 'The notification or linked record changed');
  await page.getByRole('button', { name: language === 'tr' ? 'Listeyi yenile' : 'Refresh list', exact: true }).click();
  await expect(rows).toHaveCount(1);
  expect((await page.request.post('/api/contracts/reminders', { headers })).ok()).toBe(true);
  const list = await (await page.request.get('/api/notifications')).json(); const overview = await (await page.request.get('/api/overview')).json();
  expect(list.unread).toBe(overview.notifications);
  expect(list.items.filter((row: { name: string }) => row.name === name)).toHaveLength(1);
});
