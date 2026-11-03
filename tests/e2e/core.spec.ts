import { test, expect } from '@playwright/test';
import { signIn } from './login';
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
