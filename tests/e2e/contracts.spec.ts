import { test, expect } from '@playwright/test';
import { signIn } from './login';
import { contractFields } from '../../shared/player-contracts';
import AxeBuilder from '@axe-core/playwright';
import { exampleId } from '../../prisma/seed';

const privateDocument = 'https://example.com/private-contract.pdf?key=ExampleHiddenDocument';
const privateSource = 'https://drive.google.com/file/d/ExamplePrivateContract/view?resourcekey=ExampleHiddenSource';
const privateDraft = (name: string) => ({ name, type: 'EMPLOYMENT', clubId: null, agentId: null, signedDate: null,
  startDate: '2026-01-01', endDate: '2028-06-30', isActive: true, salaryAmount: null, salaryCurrency: null, salaryPeriod: null,
  salaryBasis: null, bonuses: null, paymentDay: null, releaseClause: null, buyout: null, extensionOption: null, noticeDeadline: null, representation: null,
  documentLink: privateDocument, sourceUrl: privateSource, sourceDate: '2026-01-01', methodNote: 'Örnek özel belge kaynağı' });

test('owner records, privately reveals, edits and restores a manual contract without losing hidden salary', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const player = await (await page.request.post('/api/players', { headers, data: { name: `Örnek Sözleşme Oyuncusu ${Date.now()}`, primaryPosition: 'CM', status: 'OWN' } })).json();
  const name = `Örnek Sözleşme ${Date.now()}`; const salary = '87654.32';
  await page.goto(`/contracts?playerId=${player.id}`);
  await page.getByRole('button', { name: 'Sözleşme ekle', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Sözleşme ekle', exact: true });
  await editor.getByLabel('Sözleşme adı', { exact: true }).fill(name);
  const dates = editor.getByRole('group', { name: 'Tarihler ve ödemeler', exact: true });
  await dates.getByLabel('Başlangıç tarihi', { exact: true }).fill('2026-01-01');
  await dates.getByLabel('Bitiş tarihi', { exact: true }).fill('2028-06-30');
  await editor.getByRole('combobox', { name: 'Maaş tutarı: düzenleme seçimi', exact: true }).selectOption('replace');
  await editor.getByLabel('Maaş tutarı', { exact: true }).fill(salary);
  await editor.getByRole('combobox', { name: 'Maaş para birimi', exact: true }).selectOption('EUR');
  await editor.getByRole('combobox', { name: 'Maaş dönemi', exact: true }).selectOption('YEAR');
  await editor.getByRole('combobox', { name: 'Brüt / net', exact: true }).selectOption('GROSS');
  await editor.getByLabel('Kaynak bağlantısı', { exact: true }).fill('https://example.com/contract');
  await editor.getByLabel('Kayıt yöntemi notu', { exact: true }).fill('Örnek belge elle incelendi');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const id = page.url().split('/').at(-1)!;
  const salaryPanel = page.getByRole('heading', { name: 'Maaş tutarı', exact: true }).locator('..');
  await expect(page.getByText(salary, { exact: true })).toHaveCount(0);
  await page.clock.install();
  await salaryPanel.getByRole('button', { name: '60 saniye göster', exact: true }).click();
  await expect(salaryPanel.getByText(salary, { exact: true })).toBeVisible();
  await page.clock.fastForward(60001);
  await expect(salaryPanel.getByText(salary, { exact: true })).toHaveCount(0);
  // The browser's artificial jump did not advance the API clock. Restore the
  // real wall clock before requesting another absolute-expiry disclosure.
  await page.clock.setSystemTime(new Date());
  await page.getByRole('button', { name: 'Sözleşmeyi düzenle', exact: true }).click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByLabel('Maaş tutarı', { exact: true })).toBeDisabled();
  await expect(edit.getByLabel('Maaş tutarı', { exact: true })).toHaveValue('');
  await edit.getByLabel('Sözleşme adı', { exact: true }).fill(name + ' Güncel');
  await edit.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('heading', { name: name + ' Güncel', exact: true })).toBeVisible();
  await salaryPanel.getByRole('button', { name: '60 saniye göster', exact: true }).click();
  await expect(salaryPanel.getByText(salary, { exact: true })).toBeVisible();
  await salaryPanel.getByRole('button', { name: 'Gizle', exact: true }).click();
  await page.getByLabel('Not ekle', { exact: true }).fill('Örnek toplantı sonrası sözleşme notu');
  await page.getByRole('heading', { name: 'Notlar', exact: true }).locator('..').getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('Örnek toplantı sonrası sözleşme notu', { exact: true })).toBeVisible();
  await page.getByLabel('Dosya seç', { exact: true }).setInputFiles({ name: 'Örnek sözleşme.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF') });
  await page.getByRole('button', { name: 'Dosyayı yükle', exact: true }).click();
  await expect(page.getByText('Örnek sözleşme.pdf', { exact: true })).toBeVisible();
  const current = await (await page.request.get(`/api/contracts/${id}`)).json();
  const otherData = Object.fromEntries(Object.keys(contractFields.shape).map(key => [key, current[key]]));
  Object.assign(otherData, { name: 'Örnek Diğer Sözleşme', salaryAmount: null, bonuses: null });
  const other = await (await page.request.post(`/api/players/${player.id}/contracts`, { headers, data: otherData })).json();
  await salaryPanel.getByRole('button', { name: '60 saniye göster', exact: true }).click();
  await expect(salaryPanel.getByText(salary, { exact: true })).toBeVisible();
  await page.goto(`/contracts/${other.id}`); await expect(page.getByRole('heading', { name: 'Örnek Diğer Sözleşme', exact: true })).toBeVisible();
  await expect(page.getByText(salary, { exact: true })).toHaveCount(0);
  await page.goto(`/contracts/${id}`); await page.getByRole('button', { name: 'Sözleşmeyi düzenle', exact: true }).click();
  const staleEditor = page.getByRole('dialog'); await staleEditor.getByLabel('Sözleşme adı', { exact: true }).fill('Örnek Korunan Form');
  expect((await page.request.patch(`/api/contracts/${id}`, { headers, data: { version: current.version, changes: { isActive: false, name: 'Örnek Dışarıdan Güncellenen' } } })).ok()).toBe(true);
  // Respect the application's15-second cache freshness before simulating
  // a tab becoming visible. Headless pages need not emit visibility changes.
  await page.clock.fastForward(15001);
  const refetch = page.waitForResponse(response => response.url().endsWith(`/api/contracts/${id}`) && response.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await refetch; await page.clock.runFor(100);
  await expect(page.locator('main h1')).toHaveText('Örnek Dışarıdan Güncellenen');
  await expect(staleEditor.getByLabel('Sözleşme adı', { exact: true })).toHaveValue('Örnek Korunan Form');
  await staleEditor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(staleEditor.getByRole('alert')).toContainText('Formunuz korunuyor');
  await expect(staleEditor.getByLabel('Sözleşme adı', { exact: true })).toHaveValue('Örnek Korunan Form');
  await staleEditor.getByRole('button', { name: 'Kapat', exact: true }).click(); await page.reload();
  await page.getByRole('button', { name: 'Çöp kutusuna taşı', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Çöp kutusuna taşı', exact: true }).click();
  await expect(page).toHaveURL(/\/contracts$/);
  const entry = (await (await page.request.get('/api/trash')).json()).find((row: { entityId: string }) => row.entityId === id);
  expect((await page.request.post(`/api/trash/${entry.id}/restore`, { headers, data: { version: entry.version, recordVersion: entry.recordVersion } })).ok()).toBe(true);
  await page.goto(`/contracts/${id}`); await expect(page.getByText('Örnek sözleşme.pdf', { exact: true })).toBeVisible();
});

for (const language of ['tr', 'en']) test(`private contract links stay masked across sparse edits and expire (${language})`, async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const tr = language === 'tr';
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const documentLink = privateDocument; const sourceUrl = privateSource;
  const payload = privateDraft(`Örnek Özel Kaynak ${language} ${Date.now()}`);
  const created = await page.request.post(`/api/players/${exampleId('player-0')}/contracts`, { headers, data: payload }); expect(created.status()).toBe(201); const row = await created.json();
  if (!tr) await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.goto(`/contracts/${row.id}`); await expect(page.locator('main h1')).toHaveText(payload.name);
  const panel = page.locator('[data-contract-private="documentLink"]'); const sourcePanel = page.locator('[data-contract-private="sourceUrl"]');
  await expect(page.locator(`a[href="${documentLink}"]`)).toHaveCount(0); await expect(page.locator(`a[href="${sourceUrl}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: tr ? 'Sözleşmeyi düzenle' : 'Edit contract', exact: true }).click(); const editor = page.getByRole('dialog');
  await expect(editor.getByLabel(tr ? 'Belge bağlantısı' : 'Document URL', { exact: true })).toBeDisabled();
  await expect(editor.getByLabel(tr ? 'Kaynak bağlantısı' : 'Source URL', { exact: true })).toHaveValue('');
  await editor.getByLabel(tr ? 'Sözleşme adı' : 'Contract name', { exact: true }).fill(payload.name + ' Güncel');
  await editor.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); await expect(editor).toHaveCount(0);
  const current = await (await page.request.get(`/api/contracts/${row.id}`)).json(); expect(current).toMatchObject({ hasDocumentLink: true, hasPrivateSource: true, documentLink: null, sourceUrl: null });
  await panel.getByRole('button', { name: tr ? '60 saniye göster' : 'Reveal for 60 seconds', exact: true }).click();
  await expect(panel.locator('a')).toHaveAttribute('href', documentLink); await expect(panel.locator('a')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await panel.getByRole('button', { name: tr ? 'Gizle' : 'Hide', exact: true }).click(); await expect(panel.locator('a')).toHaveCount(0);
  await page.clock.install(); await sourcePanel.getByRole('button', { name: tr ? '60 saniye göster' : 'Reveal for 60 seconds', exact: true }).click();
  await expect(sourcePanel.locator('a')).toHaveAttribute('href', sourceUrl); await page.clock.fastForward(60_001); await expect(sourcePanel.locator('a')).toHaveCount(0);
  await page.clock.setSystemTime(new Date()); const axe = await new AxeBuilder({ page }).analyze(); expect(axe.violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
});

test('a late contract document response cannot undo an explicit hide', async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const created = await page.request.post(`/api/players/${exampleId('player-0')}/contracts`, { headers, data: privateDraft(`Örnek Geç Yanıt ${Date.now()}`) });
  expect(created.status()).toBe(201); const record = await created.json(); await page.goto(`/contracts/${record.id}`); const panel = page.locator('[data-contract-private="documentLink"]');
  await page.evaluate(() => { const original = window.fetch.bind(window); window.fetch = (input, init) => original(input, String(input).includes('/reveal') ? { ...init, signal: undefined } : init); });
  let release = () => {}; let entered = () => {}; const held = new Promise<void>(resolve => { release = resolve; }); const submitted = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/contracts/${record.id}/reveal`, async route => { const response = await route.fetch(); entered(); await held; await route.fulfill({ response }); });
  await panel.getByRole('button', { name: '60 saniye göster', exact: true }).click(); await submitted;
  await panel.getByRole('button', { name: 'Vazgeç', exact: true }).click(); const delivered = page.waitForResponse(response => response.url().endsWith(`/api/contracts/${record.id}/reveal`)); release(); await delivered;
  await page.waitForLoadState('networkidle'); await expect(panel.locator('a')).toHaveCount(0); await expect(panel.getByRole('button', { name: '60 saniye göster', exact: true })).toBeVisible();
});

test('legacy malformed date text and unknown clause status cannot crash the contract detail', async ({ page }) => {
  await signIn(page);
  const list = await (await page.request.get('/api/contracts')).json();
  const record = await (await page.request.get(`/api/contracts/${list.items[0].id}`)).json();
  await page.route(`**/api/contracts/${record.id}`, route => route.fulfill({ json: { ...record,
    releaseClause: { validFrom: '2026-06-01 invalid', met: 'Örnek eski durum' }, legacyGroups: ['releaseClause'],
  } }));
  await page.goto(`/contracts/${record.id}`);
  await expect(page.getByRole('heading', { name: record.name, exact: true })).toBeVisible();
  await expect(page.getByText('2026-06-01 invalid', { exact: true })).toBeVisible();
  await expect(page.getByText('Örnek eski durum', { exact: true })).toBeVisible();
});
