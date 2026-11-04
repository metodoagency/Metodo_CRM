import { test, expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { signIn } from './login';
import { exerciseClubMap } from './club-network';
import pg from 'pg';

for (const language of ['tr', 'en']) test(`privacy notice is shown on first login and acknowledged (${language})`, async ({ page }) => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/metodo_e2e') throw new Error('Unsafe E2E database');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try { await client.query('UPDATE "UserSettings" SET "privacyNoticeVersion" = NULL, "privacyAcknowledgedAt" = NULL, "language" = $1, "version" = "version" + 1 WHERE "ownerId" = $2', ['tr', 'owner']); }
  finally { await client.end(); }
  await page.goto('/'); await page.getByRole('button', { name: 'Test sahibiyle giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Gizlilik bildirimi' })).toBeVisible();
  await page.getByRole('button', { name: language === 'en' ? 'English' : 'Türkçe', exact: true }).click();
  await expect(page.getByRole('heading', { name: language === 'en' ? 'Privacy notice' : 'Gizlilik bildirimi' })).toBeVisible();
  const proceed = page.getByRole('button', { name: language === 'en' ? 'Record as read and continue' : 'Okundu olarak kaydet ve devam et' });
  await expect(proceed).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Kulüp ağı', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox').check(); await proceed.click();
  await expect(page.locator('aside')).toBeVisible(); await page.reload();
  await expect(page.locator('aside')).toBeVisible(); await expect(proceed).toHaveCount(0);
});

test('incident contact is masked until explicit timed reveal', async ({ page }) => {
  await signIn(page); await page.getByRole('link', { name: 'Veri ihlali kontrol listesi', exact: true }).click();
  await page.getByLabel('Olay iletişim bilgisi', { exact: true }).fill('incident@example.com');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('İletişim bilgisi güncellendi.')).toBeVisible();
  await expect(page.getByText('incident@example.com', { exact: true })).toHaveCount(0);
  await page.clock.install(); await page.getByRole('button', { name: '60 saniye göster' }).click();
  await expect(page.getByText('incident@example.com', { exact: true })).toBeVisible();
  await page.clock.fastForward(60001);
  await expect(page.getByText('incident@example.com', { exact: true })).toHaveCount(0);
  await page.clock.resume();
  await page.getByRole('link', { name: 'Ayarlar', exact: true }).click();
  const accessLog = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Hassas alan görüntüleme günlüğü' }) });
  await expect(accessLog.getByRole('cell', { name: 'Olay iletişim bilgisi', exact: true }).first()).toBeVisible();
  await expect(accessLog.getByText('incident@example.com', { exact: true })).toHaveCount(0);
});

test('table retention defaults to indefinite and purges only the confirmed record list', async ({ page }) => {
  await signIn(page); await page.goto('/clubs'); await page.getByRole('button', { name: 'Yeni kayıt' }).click();
  await page.getByRole('textbox', { name: 'Ad', exact: true }).fill(`Örnek E2E Saklama ${Date.now()}`);
  await page.getByRole('button', { name: 'Oluştur', exact: true }).click(); await expect(page).toHaveURL(/\/record\/Club\//);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/metodo_e2e') throw new Error('Unsafe E2E database');
  const client = new pg.Client({ connectionString: url.toString() }); await client.connect();
  try { await client.query('UPDATE "Club" SET "deletedAt" = $1, "version" = "version" + 1 WHERE "id" = $2', [new Date('2020-01-01'), id]); } finally { await client.end(); }
  await page.goto('/settings');
  await expect(page.getByLabel('Tablo', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tablo', { exact: true }).locator('option')).toHaveCount(61);
  await page.getByLabel('Tablo', { exact: true }).selectOption('WorkLog');
  await expect(page.getByLabel('Gün', { exact: true })).toHaveValue('');
  await page.getByLabel('Tablo', { exact: true }).selectOption('Club'); await page.getByLabel('Gün', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click(); await expect(page.getByText('Saklama ayarı kaydedildi.')).toBeVisible();
  await page.getByRole('button', { name: 'Saklama temizliğini önizle', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByText(id, { exact: true })).toBeVisible();
  const purge = dialog.getByRole('button', { name: 'Listelenen kayıtları kalıcı sil' }); await expect(purge).toBeDisabled();
  await dialog.getByRole('checkbox').check(); await purge.click(); await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Önizlemedeki kayıtlar kaldırıldı.')).toBeVisible();
});
test('owner creates club and player, suggests a player and reads the shared timeline', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Ofisiniz, bir bakışta.' })).toBeVisible();
  await page.screenshot({ path: '.local/dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Kulüp ağı', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni kayıt' }).click();
  const clubName = `Örnek E2E Kulüp ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Ad', exact: true }).fill(clubName);
  await page.getByRole('textbox', { name: 'Şehir' }).fill('Örnek Şehir');
  await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: clubName })).toBeVisible();
  await expect(page.getByText(`${clubName} · oluşturuldu`)).toBeVisible();
  await page.getByRole('link', { name: 'Oyuncular', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni kayıt' }).click();
  const playerName = `Örnek E2E Oyuncu ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Ad', exact: true }).fill(playerName);
  await page.getByLabel('Pozisyon', { exact: true }).selectOption('CM');
  await page.getByLabel('Doğum tarihi', { exact: true }).fill('2000-02-01');
  await page.getByRole('button', { name: 'Oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: playerName })).toBeVisible();
  const profileDownload = page.waitForEvent('download');
  const profileResponse = page.waitForResponse(response => response.url().includes('/api/documents/profile/') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Profil PDF indir', exact: true }).click();
  const [profileFile, profileHttp] = await Promise.all([profileDownload, profileResponse]);
  expect(profileHttp.headers()['x-metodo-document-engine']).toBe('chromium');
  expect(profileFile.suggestedFilename()).toBe('metodo-profile-tr.pdf');
  const profileStream = await profileFile.createReadStream();
  const profileChunks = []; for await (const chunk of profileStream) profileChunks.push(Buffer.from(chunk));
  const profileParser = new PDFParse({ data: new Uint8Array(Buffer.concat(profileChunks)) });
  try {
    const profile = (await profileParser.getText()).text;
    expect(profile).toContain(playerName); expect(profile).toContain('Şablon profile-1'); expect(profile).not.toContain('01.02.2000');
  } finally { await profileParser.destroy(); }
  await expect(page.getByRole('button', { name: '60 saniye göster' })).toBeVisible();
  await expect(page.getByText('2000-02-01', { exact: true })).toHaveCount(0);
  await page.clock.install();
  await page.getByRole('button', { name: '60 saniye göster' }).click();
  await expect(page.getByText('01.02.2000', { exact: true })).toBeVisible();
  await page.clock.fastForward(60001);
  await expect(page.getByText('01.02.2000', { exact: true })).toHaveCount(0);
  await page.clock.resume();
  await page.getByRole('link', { name: 'Transfer talepleri', exact: true }).click();
  await page.getByRole('link', { name: /Örnek Orta Saha Talebi/ }).click();
  await page.getByRole('button', { name: 'Oyuncu öner', exact: true }).click();
  await page.getByLabel('Oyuncu', { exact: true }).selectOption({ label: playerName });
  await page.getByLabel('Transfer gerekçesi').fill('Örnek oyun profili uyumu');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/Örnek SK A kulübüne önerildi/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Oyuncular', exact: true }).click();
  await page.getByPlaceholder('Kayıtlarda ara…').fill(playerName);
  await page.getByRole('link', { name: new RegExp(playerName) }).click();
  await expect(page.getByText(/Örnek SK A kulübüne önerildi/)).toBeVisible();
});
test('owner manages club geography and downloads a private file with logged access', async ({ page }) => {
  await signIn(page); const me = await (await page.request.get('/api/me')).json();
  const response = await page.request.post('/api/clubs', { headers: { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken }, data: { name: `Örnek Dosya Kulübü ${Date.now()}` } });
  expect(response.status()).toBe(201); const club = await response.json(); await page.goto(`/record/Club/${club.id}`);
  const pdf = Buffer.from('%PDF-1.7\n%%EOF');
  await page.getByLabel('Dosya seç', { exact: true }).setInputFiles({ name: 'Örnek dosya.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: 'Dosyayı yükle', exact: true }).click();
  await expect(page.getByText('Örnek dosya.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'İndirme bağlantısı oluştur', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('link', { name: 'Dosyayı indir', exact: true }).click();
  const download = await downloading; const stream = await download.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks)).toEqual(pdf);
  await page.getByRole('button', { name: 'Belge işleme', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/Henüz bir belge işleme adaptörü/)).toBeVisible();
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByRole('link', { name: 'Ayarlar', exact: true }).click();
  await expect(page.getByText('Dosya içeriği', { exact: true }).first()).toBeVisible();
  await exerciseClubMap(page, club, { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken });
});

test('staff proposal stays pending through preview and applies after explicit approval', async ({ page }) => {
  await signIn(page);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const name = `Örnek Atama ${Date.now()}`;
  const clubResponse = await page.request.post('/api/clubs', { headers, data: { name } });
  const personResponse = await page.request.post('/api/people', { headers, data: { name, role: 'HEAD_COACH' } });
  expect(clubResponse.status()).toBe(201); expect(personResponse.status()).toBe(201);
  const club = await clubResponse.json();
  const staff = () => page.request.get(`/api/clubs/${club.id}/sections/staff`).then(response => response.json());
  await page.goto(`/record/Club/${club.id}`);
  await page.getByRole('button', { name: 'Güncellemeler', exact: true }).click();
  await page.getByRole('button', { name: 'Personel önerisi ekle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Güncelleme türü').selectOption('coach_appointment');
  await dialog.getByLabel('Ad', { exact: true }).fill(name);
  await dialog.getByLabel('Değişiklik özeti').fill('Örnek atama önerisi');
  await dialog.getByLabel('Kaynak URL (isteğe bağlı)').fill('https://example.com/appointment');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('link', { name, exact: true }).click();
  await page.locator('.list-line').filter({ hasText: name }).getByRole('button', { name: 'Güncellemeyi incele' }).click();
  await dialog.getByLabel('Kişi adına göre ara').fill(name);
  await dialog.getByLabel('Atanacak kişiyi seçin').selectOption({ label: name });
  await dialog.getByLabel('Başlangıç tarihi').fill('2025-01-15');
  await dialog.getByRole('button', { name: 'Değişikliği önizle' }).click();
  await expect(dialog.getByText(`${name} · Teknik direktör · 15.01.2025 tarihinde başlayacak`)).toBeVisible();
  expect((await staff()).items).toEqual([]);
  await dialog.getByRole('button', { name: 'Onayla ve uygula' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await staff()).items).toMatchObject([{ name, label: 'HEAD_COACH' }]);
});

test('iframe shows top-level login fallback', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { const iframe = document.createElement('iframe'); iframe.src = '/'; iframe.title = 'test-frame'; document.body.replaceChildren(iframe); });
  await expect(page.frameLocator('iframe').getByRole('link', { name: 'Yeni sekmede aç' })).toHaveAttribute('target', '_blank');
});

test('owner sees field evidence and safely restores and purges a record', async ({ page }) => {
  await signIn(page);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const name = `Örnek Yaşam Döngüsü ${Date.now()}`;
  const response = await page.request.post('/api/clubs', { headers, data: { name, city: 'Örnek Şehir', fieldProvenance: { city: { sourceUrl: 'https://example.com/city-source', sourceType: 'OFFICIAL', retrievedAt: '2026-11-02T00:00:00Z', verificationStatus: 'VERIFIED' } } } });
  expect(response.status()).toBe(201); const record = await response.json();
  await page.goto(`/record/Club/${record.id}`);
  await expect(page.getByRole('heading', { name: 'Alanların kaynak bilgileri' })).toBeVisible();
  await expect(page.locator('a[href="https://example.com/city-source"]')).toBeVisible();
  for (const action of ['restore', 'purge']) {
    await page.getByRole('button', { name: 'Çöp kutusuna taşı', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Bağlantılı kayıtlar' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Çöp kutusuna taşı', exact: true }).click();
    await page.getByRole('link', { name: 'Çöp kutusu', exact: true }).click();
    const item = page.getByText(name, { exact: true }).locator('..');
    await item.getByRole('button', { name: action === 'restore' ? 'Geri yükle' : 'Kalıcı olarak sil', exact: true }).click();
    if (action === 'purge') {
      await expect(page.getByRole('dialog').getByRole('heading', { name: 'Bağlantılı kayıtlar' })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Kalıcı olarak sil', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    if (action === 'restore') await page.goto(`/record/Club/${record.id}`);
  }
  expect((await page.request.get(`/api/records/Club/${record.id}`)).status()).toBe(404);
});

test('example cleanup requires an explicit preview confirmation', async ({ page }) => {
  await signIn(page); await page.getByRole('link', { name: 'Ayarlar', exact: true }).click();
  await page.getByRole('button', { name: 'ÖRNEK veriyi temizle', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Bağlantılı kayıtlar' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'ÖRNEK veriyi temizle', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button', { name: 'ÖRNEK veriyi temizle', exact: true })).toBeEnabled();
});
