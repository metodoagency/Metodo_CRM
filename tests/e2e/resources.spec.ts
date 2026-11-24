import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './login';
import sharp from 'sharp';
import { exampleId } from '../../prisma/seed';

test.use({ actionTimeout: 10000 });
async function context(page: Page) {
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': (await (await page.request.get('/api/me')).json()).csrfToken };
  const person = (await (await page.request.get('/api/people')).json()).items.find((row: { isExample: boolean }) => row.isExample);
  expect(person).toBeTruthy(); return { headers, person };
}
async function add(page: Page, name: string) {
  const { headers } = await context(page); const response = await page.request.post('/api/resources', { headers, data: { name, kind: 'DOCUMENT', externalUrl: 'https://drive.google.com/file/d/ExampleBrowser/view?resourcekey=ExamplePrivateKey', isExample: true } });
  expect(response.status()).toBe(201); return response.json();
}

for (const language of ['tr', 'en']) test(`Drive library and record links preserve masking, edits and Trash (${language})`, async ({ page }) => {
  test.setTimeout(120000); await signIn(page); const { headers, person } = await context(page); const tr = language === 'tr';
  if (!tr) await page.getByRole('button', { name: 'English', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('lang', language);
  await page.goto(`/record/Person/${person.id}`); const workspace = page.getByRole('region', { name: tr ? 'Drive kaynakları' : 'Drive resources', exact: true });
  await workspace.getByRole('button', { name: tr ? 'Drive bağlantısı ekle' : 'Add Drive link', exact: true }).click();
  const name = `Örnek Kaynak ${language} ${Date.now()}`; const url = 'https://drive.google.com/file/d/ExampleFullMatch/view?resourcekey=ExampleCaseKey'; let dialog = page.getByRole('dialog');
  await dialog.getByLabel(tr ? 'Kaynak adı' : 'Resource name', { exact: true }).fill(name);
  await dialog.getByLabel(tr ? 'Kaynak türü' : 'Resource type', { exact: true }).selectOption('FULL_MATCH');
  await dialog.getByLabel(tr ? 'Google Drive bağlantısı' : 'Google Drive link', { exact: true }).fill(url);
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/resources' && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); const response = await created; expect(response.status()).toBe(201); const row = await response.json(); await expect(dialog).toHaveCount(0);
  let item = page.locator(`[data-resource-id="${row.id}"]`); await expect(item).toContainText(name); await expect(item.locator('a')).toHaveCount(0);
  await item.getByRole('button', { name: tr ? 'Bağlantıyı göster' : 'Show link', exact: true }).click();
  await expect(item.getByRole('link', { name: tr ? 'Drive’da aç' : 'Open in Drive', exact: true })).toHaveAttribute('href', url);
  await expect(item.locator('a')).toHaveAttribute('rel', 'noopener noreferrer'); await expect(item.locator('a')).toHaveAttribute('target', '_blank');
  await item.getByRole('button', { name: tr ? 'Bağlantıyı gizle' : 'Hide link', exact: true }).click(); await expect(item.locator('a')).toHaveCount(0);
  await page.goto('/resources'); await page.getByLabel(tr ? 'Kaynak ara' : 'Search resources', { exact: true }).fill(name); item = page.locator(`[data-resource-id="${row.id}"]`); await expect(item).toBeVisible(); await expect(item.locator('a')).toHaveCount(0);
  await item.getByRole('button', { name: tr ? 'Kaynağı düzenle' : 'Edit resource', exact: true }).click(); dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(tr ? 'Yeni bağlantı (değiştirmek için)' : 'New link (to replace)', { exact: true })).toHaveValue('');
  await dialog.getByLabel(tr ? 'Kaynak adı' : 'Resource name', { exact: true }).fill(name + ' II'); await dialog.getByRole('button', { name: tr ? 'Kaydet' : 'Save', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(item).toContainText(name + ' II');
  const darkAxe = await new AxeBuilder({ page }).analyze(); expect(darkAxe.violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  await item.getByRole('button', { name: tr ? 'Kaynağı Çöp Kutusu’na taşı' : 'Move resource to Trash', exact: true }).click(); dialog = page.getByRole('dialog');
  const deleted = page.waitForResponse(reply => new URL(reply.url()).pathname === `/api/resources/${row.id}` && reply.request().method() === 'DELETE');
  await dialog.getByRole('button', { name: tr ? 'İşlemi onayla' : 'Confirm action', exact: true }).click(); expect((await deleted).status()).toBe(200); await expect(dialog).toHaveCount(0); await expect(item).toHaveCount(0);
  const trash = (await (await page.request.get('/api/trash')).json()).find((entry: { entityId: string }) => entry.entityId === row.id); expect(trash).toBeTruthy();
  expect((await page.request.post(`/api/trash/${trash.id}/restore`, { headers, data: { version: trash.version, recordVersion: trash.recordVersion } })).status()).toBe(200);
  await page.reload(); await expect(page.locator(`[data-resource-id="${row.id}"]`)).toBeVisible();
  await page.locator(`[data-resource-id="${row.id}"]`).getByRole('button', { name: tr ? 'Bağlı kayıtlar' : 'Linked records', exact: true }).click();
  await expect(page.locator(`[data-resource-id="${row.id}"]`).getByRole('link', { name: person.name, exact: true })).toHaveAttribute('href', `/record/Person/${person.id}`);
  const settings = await (await page.request.get('/api/settings')).json(); expect((await page.request.patch('/api/settings', { headers, data: { version: settings.version, theme: 'light' } })).status()).toBe(200); await page.reload();
  await page.getByLabel(tr ? 'Kaynak ara' : 'Search resources', { exact: true }).fill(name); await page.setViewportSize({ width: 390, height: 844 }); const lightAxe = await new AxeBuilder({ page }).analyze(); expect(lightAxe.violations.filter(issue => ['serious', 'critical'].includes(issue.impact ?? ''))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (tr) await page.screenshot({ path: '.local/resource-library-mobile.png' });
});

test('Drive disclosure expires and a delayed response cannot restore a hidden link', async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const row = await add(page, `Örnek Gizli Kaynak ${Date.now()}`);
  await page.goto('/resources'); await page.getByLabel('Kaynak ara', { exact: true }).fill(row.name); const item = page.locator(`[data-resource-id="${row.id}"]`);
  // Deliberately ignore AbortSignal so the generation guard is independently tested.
  await page.evaluate(() => { const original = window.fetch.bind(window); window.fetch = (input, init) => original(input, String(input).includes('/reveal') ? { ...init, signal: undefined } : init); });
  let release = () => {}; let entered = () => {}; const held = new Promise<void>(resolve => { release = resolve; }); const submitted = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`**/api/resources/${row.id}/reveal`, async route => { const response = await route.fetch(); entered(); await held; await route.fulfill({ response }); });
  await item.getByRole('button', { name: 'Bağlantıyı göster', exact: true }).click(); await submitted; await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const delivered = page.waitForResponse(reply => reply.url().endsWith(`/api/resources/${row.id}/reveal`)); release(); await delivered; await page.waitForLoadState('networkidle'); await expect(item.locator('a')).toHaveCount(0);
  await page.unroute(`**/api/resources/${row.id}/reveal`); await page.clock.install(); await item.getByRole('button', { name: 'Bağlantıyı göster', exact: true }).click(); await expect(item.locator('a')).toHaveCount(1);
  await page.clock.fastForward(60_001); await expect(item.locator('a')).toHaveCount(0);
});

test('Drive edit keeps its dirty draft and opening version during a background refresh', async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const { headers } = await context(page); const row = await add(page, `Örnek Sürümlü Kaynak ${Date.now()}`);
  await page.goto('/resources'); await page.getByLabel('Kaynak ara', { exact: true }).fill(row.name); const item = page.locator(`[data-resource-id="${row.id}"]`);
  await item.getByRole('button', { name: 'Kaynağı düzenle', exact: true }).click(); const dialog = page.getByRole('dialog'); const field = dialog.getByLabel('Kaynak adı', { exact: true }); await field.fill('Örnek Korunan Kaynak Taslağı');
  expect((await page.request.patch(`/api/resources/${row.id}`, { headers, data: { version: 1, changes: { kind: 'DOSSIER' } } })).status()).toBe(200);
  await page.clock.install(); await page.clock.fastForward(15_001); const refetch = page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/resources' && reply.request().method() === 'GET');
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))); await refetch; await expect(field).toHaveValue('Örnek Korunan Kaynak Taslağı');
  const stale = page.waitForResponse(reply => reply.url().endsWith(`/api/resources/${row.id}`) && reply.request().method() === 'PATCH'); await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click(); expect((await stale).status()).toBe(409);
  await expect(field).toHaveValue('Örnek Korunan Kaynak Taslağı'); await expect(dialog.getByRole('alert')).toBeVisible();
});

test('record resource picker reaches beyond fifty same-name resources', async ({ page }) => {
  test.setTimeout(120000); await signIn(page); const { headers, person } = await context(page); const name = `Örnek Sayfalı Kaynak ${Date.now()}`; const first = await add(page, name);
  for (let index = 0; index < 50; index++) {
    const response = await page.request.post('/api/resources', { headers, data: { name, kind: 'DOCUMENT', externalUrl: 'https://drive.google.com/file/d/ExamplePagedResource/view', isExample: true } }); expect(response.status()).toBe(201);
  }
  await page.goto(`/record/Person/${person.id}`); const workspace = page.getByRole('region', { name: 'Drive kaynakları', exact: true }); await workspace.getByRole('button', { name: 'Kütüphaneden bağla', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kaynak ara', { exact: true }).fill(name); await dialog.getByRole('button', { name: 'Sonraki', exact: true }).click(); await dialog.getByLabel('Bağlanacak kaynak', { exact: true }).selectOption(first.id);
  await dialog.getByRole('button', { name: 'Kütüphaneden bağla', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(workspace.locator(`[data-resource-id="${first.id}"]`)).toBeVisible();
});

test('Drive mode offers a separate portrait upload and keeps business-file upload closed', async ({ page }) => {
  test.setTimeout(90000); await signIn(page); const { headers } = await context(page);
  const record = await page.request.get(`/api/records/Player/${exampleId('player-0')}`); expect(record.status()).toBe(200); const player = await record.json(); expect(player.isExample).toBe(true);
  await page.goto(`/record/Player/${player.id}`); await expect(page.getByLabel('Dosya seç', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Profil fotoğrafı seç', exact: true }).click(); const dialog = page.getByRole('dialog');
  const png = await sharp({ create: { width: 12, height: 16, channels: 3, background: '#d5bd91' } }).png().toBuffer();
  await dialog.getByLabel('Profil görseli seç', { exact: true }).setInputFiles({ name: 'Örnek profil.png', mimeType: 'image/png', buffer: png });
  const uploaded = page.waitForResponse(reply => reply.url().endsWith(`/api/players/${player.id}/photo-files`) && reply.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Profil görselini yükle', exact: true }).click(); const response = await uploaded; expect(response.status()).toBe(201); const file = await response.json();
  expect((await page.request.get(`/api/records/Player/${player.id}/files`)).status()).toBe(200);
  await expect(dialog.getByLabel('Yüklenen fotoğraf', { exact: true })).toHaveValue(file.id);
  await dialog.getByLabel('Kaynak adresi', { exact: true }).fill('https://example.com/portrait'); await dialog.getByLabel('Fotoğraf kullanım hakkı notu', { exact: true }).fill('Örnek sahibin izinli test görseli');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect((await page.request.post(`/api/records/Player/${player.id}/files`, { headers, data: {} })).status()).toBe(409);
});
