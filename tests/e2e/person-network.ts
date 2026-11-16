import { expect, type Page } from '@playwright/test';

export async function exercisePersonNetwork(page: Page, club: { id: string; name: string }, headers: Record<string, string>) {
  const makePerson = async (name: string) => {
    const response = await page.request.post('/api/people', { headers, data: { name, role: 'ASSISTANT' } });
    expect(response.status()).toBe(201);
    return response.json() as Promise<{ id: string }>;
  };
  const person = await makePerson('Örnek Kişi Ağı');
  const colleague = await makePerson('Örnek Aynı Kulüp Görevlisi');
  const response = await page.request.post(`/api/people/${colleague.id}/tenures`, {
    headers, data: { clubId: club.id, role: 'OFFICIAL', startDate: '2024-04-01', endDate: '2024-08-01', sourceUrl: null },
  });
  expect(response.status()).toBe(201);
  await page.goto(`/record/Person/${person.id}`);
  await page.getByRole('button', { name: 'Kişi profilini düzenle', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Kişi profilini düzenle' });
  await profile.getByLabel('Doğum tarihi', { exact: true }).fill('2000-02-29');
  await profile.getByRole('checkbox', { name: 'Doğum tarihini gün ve ay olarak göster' }).check();
  await profile.getByLabel('TFF profil adresi', { exact: true }).fill('https://example.com/profile');
  await profile.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(profile).toBeHidden();
  await expect(page.getByRole('link', { name: 'TFF profilini aç' })).toHaveAttribute('href', 'https://example.com/profile');
  await page.clock.install();
  await page.getByRole('button', { name: '60 saniye göster', exact: true }).click();
  await expect(page.getByText('29.02', { exact: true })).toBeVisible();
  await expect(page.getByText('29.02.2000', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Yaşı 60 saniye göster', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Yaş · \d+/ })).toBeVisible();
  await page.clock.fastForward(60_001);
  await expect(page.getByText('29.02', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Yaşı 60 saniye göster', exact: true })).toBeVisible();
  await page.clock.resume();

  await page.getByRole('button', { name: 'Görev ekle', exact: true }).click();
  const tenure = page.getByRole('dialog', { name: 'Görev ekle' });
  await tenure.getByLabel('Kulüp seçeneklerinde ara').fill(club.name);
  await tenure.getByRole('combobox', { name: 'Kulüp', exact: true }).selectOption({ label: club.name });
  await tenure.getByRole('combobox', { name: 'Görev', exact: true }).selectOption('ASSISTANT');
  await tenure.getByLabel('Başlangıç tarihi', { exact: true }).fill('2024-05-01');
  await tenure.getByLabel('Ayrılış tarihi', { exact: true }).fill('2024-06-01');
  await tenure.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(tenure).toBeHidden();
  await page.getByRole('button', { name: 'Birlikte çalıştı', exact: true }).click();
  const overlap = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Örnek Aynı Kulüp Görevlisi', exact: true }) });
  await expect(overlap).toContainText('01.05.2024 – 31.05.2024');
  await overlap.getByRole('link', { name: club.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/record/Club/${club.id}\\?tab=staff$`));
  await expect(page.getByRole('button', { name: 'Personel', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Örnek Kişi Ağı', exact: true })).toBeVisible();
}
