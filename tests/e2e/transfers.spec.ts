import { test, expect } from '@playwright/test';
import { signIn } from './login';
import { istanbulToday } from '../../shared/domain';

test('owner updates the latest presentation in both matrices and follows overdue work', async ({ page }) => {
  await signIn(page);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const suffix = Date.now();
  const clubName = `Örnek Matris Kulübü ${suffix}`;
  const playerName = `Örnek Matris Oyuncusu ${suffix}`;
  const personName = `Örnek Matris Kişisi ${suffix}`;
  const club = await (await page.request.post('/api/clubs', { headers, data: { name: clubName } })).json();
  const person = await (await page.request.post('/api/people', { headers, data: { name: personName } })).json();
  const player = await (await page.request.post('/api/players', { headers, data: { name: playerName, primaryPosition: 'CM' } })).json();
  expect((await page.request.post('/api/relations', { headers, data: {
    fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'memberOf',
  } })).status()).toBe(201);
  await page.goto('/presentations');
  await page.getByRole('button', { name: 'Sunum kaydet', exact: true }).click();
  const editor = page.getByRole('dialog');
  for (const [type, name] of [['Kulüp', clubName], ['Kişi', personName], ['Oyuncu', playerName]]) {
    await editor.getByRole('textbox', { name: `${type} ara`, exact: true }).fill(name);
    await editor.getByRole('textbox', { name: `${type} ara`, exact: true }).press('Enter');
    await editor.getByRole('combobox', { name: type, exact: true }).selectOption({ label: name });
  }
  await editor.getByLabel('Takip tarihi', { exact: true }).fill('2000-01-01');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: 'Kulüp × oyuncu', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kulüp ara', exact: true }).fill(clubName);
  await page.getByRole('textbox', { name: 'Oyuncu adına göre ara', exact: true }).fill(playerName);
  await page.getByRole('button', { name: 'Kayıt arama', exact: true }).click();
  await page.getByRole('button', { name: `${clubName} · ${playerName}` }).click();
  await editor.getByRole('combobox', { name: 'Durum', exact: true }).selectOption('INTERESTED');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: `${clubName} · ${playerName}` })).toContainText('İlgileniyor');
  await page.getByRole('button', { name: 'Kişi × oyuncu', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kişi ara', exact: true }).fill(personName);
  await page.getByRole('textbox', { name: 'Oyuncu adına göre ara', exact: true }).fill(playerName);
  await page.getByRole('button', { name: 'Kayıt arama', exact: true }).click();
  await expect(page.getByRole('button', { name: `${personName} · ${playerName}` })).toContainText('İlgileniyor');
  await page.goto('/');
  await page.locator('a[href^="/presentations?presentation="]').filter({ hasText: `${playerName} → ${clubName}` }).click();
  await expect(page.getByRole('row').filter({ hasText: playerName })).toContainText('İlgileniyor');
  expect(player.id).toBeTruthy();
});

test('owner records a club mandate before adding and closing a private sales listing', async ({ page }) => {
  await signIn(page);
  const me = await (await page.request.get('/api/me')).json();
  const headers = { origin: 'http://localhost:5173', 'x-csrf-token': me.csrfToken };
  const suffix = Date.now();
  const club = await (await page.request.post('/api/clubs', { headers, data: { name: `Örnek Satış Kulübü ${suffix}` } })).json();
  const playerName = `Örnek Satış Oyuncusu ${suffix}`;
  expect((await page.request.post('/api/players', { headers, data: { name: playerName, primaryPosition: 'CF' } })).status()).toBe(201);
  await page.goto(`/record/Club/${club.id}?tab=players`);
  await page.getByRole('button', { name: 'Kulüp yetkileri', exact: true }).click();
  await page.getByRole('button', { name: 'Yetki kaydet', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: 'Oyuncu ara', exact: true }).fill(playerName);
  await editor.getByRole('textbox', { name: 'Oyuncu ara', exact: true }).press('Enter');
  await editor.getByRole('combobox', { name: 'Oyuncu', exact: true }).selectOption({ label: playerName });
  await editor.getByRole('textbox', { name: 'Ad', exact: true }).fill('Örnek Kulüp Yetkisi');
  await editor.getByLabel('Başlangıç tarihi', { exact: true }).fill(istanbulToday());
  await editor.getByLabel('Bitiş tarihi', { exact: true }).fill('2098-01-01');
  await editor.getByLabel('Yetki kapsamı', { exact: true }).fill('Örnek bonservis görüşmeleri');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: 'Kulüp satış listesi', exact: true }).click();
  await page.getByRole('button', { name: 'Satış kaydı ekle', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Oyuncu ara', exact: true }).fill(playerName);
  await editor.getByRole('textbox', { name: 'Oyuncu ara', exact: true }).press('Enter');
  await editor.getByRole('combobox', { name: 'Oyuncu', exact: true }).selectOption({ label: playerName });
  await editor.getByLabel('İstenen bonservis', { exact: true }).fill('1234.56');
  await editor.getByLabel('Satış kapsamı', { exact: true }).fill('Örnek özel satış');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(editor).toBeHidden();
  const listing = page.getByRole('listitem').filter({ hasText: 'Örnek özel satış' });
  await expect(listing).toContainText('Geçerli yetki');
  await expect(listing).toContainText('Özel');
  await listing.getByRole('button', { name: 'Satış kaydını düzenle', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Satış durumu', exact: true }).selectOption('CLOSED');
  await editor.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(listing).toContainText('Kapalı');
});
