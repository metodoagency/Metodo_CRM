import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

export async function exercisePlayerEvidence(page: Page) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Piyasa değeri kaydet', exact: true }).click();
  await dialog.getByLabel('Tutar', { exact: true }).fill('125000,50');
  await dialog.getByLabel('Değer tarihi', { exact: true }).fill('2025-01-12');
  await dialog.getByLabel('Kaynak adresi', { exact: true }).fill('https://example.com/value');
  await dialog.getByLabel('Yöntem notu', { exact: true }).fill('Örnek manuel değer girişi');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByText('Piyasa değeri geçmişi', { exact: true }).click();
  await expect(page.getByText('Örnek manuel değer girişi', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Bu sayfadaki piyasa değeri grafiği' })).toBeVisible();

  const png = await sharp({ create: { width: 12, height: 16, channels: 3, background: '#bade90' } }).png().toBuffer();
  await page.getByLabel('Dosya seç', { exact: true }).setInputFiles({ name: 'Örnek portre.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Dosyayı yükle', exact: true }).click();
  await expect(page.getByText('Örnek portre.png', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profil fotoğrafı seç', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Yüklenen fotoğraf', exact: true }).selectOption({ label: 'Örnek portre.png' });
  await dialog.getByLabel('Kaynak adresi', { exact: true }).fill('https://example.com/portrait');
  await dialog.getByLabel('Fotoğraf kullanım hakkı notu', { exact: true }).fill('Örnek kullanım izni');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Örnek kullanım izni', { exact: true })).toBeVisible();
  const portrait = page.locator('.player-portrait img');
  await portrait.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(12);
}
