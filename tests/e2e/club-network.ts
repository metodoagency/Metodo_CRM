import { expect, type Page } from '@playwright/test';
import type { ClubGeography } from '../../shared/club-network';

export async function exerciseClubMap(page: Page, club: { id: string; name: string }, headers: Record<string, string>) {
  const geography = await (await page.request.get('/api/clubs/geography')).json() as ClubGeography;
  const country = geography.countries.find(item => item.isoCode === 'RS')!;
  expect(country).toBeDefined();
  const missingName = `${club.name} Konumsuz`;
  const missingResponse = await page.request.post('/api/clubs', { headers, data: { name: missingName } });
  expect(missingResponse.status()).toBe(201);
  const missing = await missingResponse.json();

  await page.goto('/clubs');
  await page.getByRole('button', { name: 'Coğrafi alan ekle', exact: true }).click();
  const regionName = `Örnek Harita Bölgesi ${Date.now()}`;
  const form = page.getByRole('dialog');
  await form.getByLabel('Alan türü', { exact: true }).selectOption('Region');
  await form.getByLabel('Ad', { exact: true }).fill(regionName);
  await form.getByLabel('Ülke', { exact: true }).selectOption(country.id);
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(form).toHaveCount(0);
  const updated = await (await page.request.get('/api/clubs/geography')).json() as ClubGeography;
  const region = updated.regions.find(item => item.name === regionName)!;
  expect(region).toBeDefined();

  await page.goto(`/record/Club/${club.id}`);
  await page.getByRole('button', { name: 'Kulüp bilgilerini düzenle', exact: true }).click();
  await form.getByLabel('Ülke', { exact: true }).selectOption(country.id);
  await form.getByLabel('Bölge', { exact: true }).selectOption(region.id);
  await form.getByLabel('Enlem', { exact: true }).fill('44.6');
  await form.getByLabel('Boylam', { exact: true }).fill('20.5');
  await form.getByLabel('İlişki durumu', { exact: true }).selectOption('ACTIVE');
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('44.6, 20.5', { exact: true })).toBeVisible();
  const missingLocation = await page.request.patch(`/api/clubs/${missing.id}/location`, { headers, data: {
    version: missing.version, countryId: country.id, regionId: region.id, lat: null, lng: null, city: null,
    stadium: null, relationStatus: 'NEW', isTracked: false,
  } });
  expect(missingLocation.status()).toBe(200);

  await page.goto('/clubs');
  await page.getByPlaceholder('Kayıtlarda ara…').fill(club.name);
  await page.getByRole('button', { name: new RegExp(regionName) }).click();
  await expect(page.locator('.club-location-marker')).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: missingName }).getByText('Konum eklenmedi', { exact: true })).toBeVisible();
  await page.locator('path[data-country-code="TR"]').dispatchEvent('click');
  await expect(page.locator('.club-location-marker')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: club.name })).toHaveCount(0);

  await page.goto(`/record/Club/${club.id}`);
  await page.getByRole('button', { name: 'Notlar', exact: true }).click();
  await page.getByRole('button', { name: 'Kulüp notu ekle', exact: true }).click();
  await form.getByRole('textbox', { name: 'Notlar' }).fill('Örnek Kulüp Takip Notu');
  await form.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('Örnek Kulüp Takip Notu', { exact: true })).toBeVisible();
}
