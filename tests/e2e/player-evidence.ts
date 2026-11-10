import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';

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
  const portrait = page.locator('.player-photo-panel img');
  await portrait.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(12);
}

export async function exercisePlayerCardEditor(page: Page) {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Kart bilgilerini düzenle', exact: true }).click();
  await dialog.getByLabel('Uyruklar').fill('Örnek uyruk');
  await dialog.getByRole('combobox', { name: 'AB pasaportu', exact: true }).selectOption('no');
  await dialog.getByLabel('Boy (cm)', { exact: true }).fill('183');
  await dialog.getByLabel('Kilo (kg)', { exact: true }).fill('73,45');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('main .player-infographic')).toContainText('73,45');

  await page.getByRole('button', { name: 'Genel bilgileri düzenle', exact: true }).click();
  const editor = dialog.getByRole('textbox', { name: 'Biyografi metni' });
  await expect(editor).toBeEditable();
  await editor.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'Örnek biyografi başlığı');
    clipboardData.setData('text/html', '<img src="https://example.com/rejected.png" onerror="document.body.dataset.pasteExecuted=1">');
    element.focus();
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(editor.locator('img')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Başlık', exact: true }).click();
  await expect(editor.locator('h3')).toHaveText('Örnek biyografi başlığı');
  await editor.press('End');
  await editor.press('Enter');
  await dialog.getByLabel('Bağlantı adresi').fill('https://example.com/source');
  await dialog.getByRole('button', { name: 'Bağlantı ekle', exact: true }).click();
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/source');
  await dialog.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Örnek biyografi başlığı', exact: true })).toBeVisible();
}

export async function exercisePrintCard(page: Page) {
  const printSheet = page.locator('.player-card-print');
  await expect(printSheet).toBeHidden();
  await printSheet.locator('img').evaluate((image: HTMLImageElement) => image.decode());
  const pdf = new PDFParse({ data: new Uint8Array(await page.pdf({ printBackground: true })) });
  try {
    const text = (await pdf.getText()).text;
    expect(text).toContain('Örnek uyruk');
    expect(text).toContain('Metodo CRM');
    expect(text).not.toMatch(/biyografi başlığı|01\.02\.2000|Kademe|Çalışma alanı|Yaş/);
  } finally { await pdf.destroy(); }

  await page.getByRole('button', { name: 'Yazdırma önizlemesi', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Yazdırma önizlemesi' });
  await dialog.getByRole('checkbox', { name: 'Yaşı ekle', exact: true }).check();
  const print = dialog.getByRole('button', { name: 'Kartı yazdır', exact: true });
  await expect(print).toBeDisabled();
  await dialog.getByRole('button', { name: 'Seçilen alanları önizle', exact: true }).click();
  await expect(dialog.locator('dt').filter({ hasText: /^Yaş$/ })).toBeVisible();
  await expect(dialog.locator('dt').filter({ hasText: /^Lig uygunluğu$/ })).toHaveCount(0);
  await expect(printSheet.locator('dt').filter({ hasText: /^Yaş$/ })).toHaveCount(0);
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'));
      document.body.dataset.testPrint = document.querySelector('.player-card-print')?.textContent ?? '';
      window.dispatchEvent(new Event('beforeprint'));
      document.body.dataset.secondPrint = document.querySelector('.player-card-print')?.textContent ?? '';
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await print.click();
  const selected = await page.locator('body').getAttribute('data-test-print');
  expect(selected).toContain('Yaş');
  expect(selected).not.toMatch(/01\.02\.2000|Kademe|biyografi/);
  expect(await page.locator('body').getAttribute('data-second-print')).not.toContain('Yaş');
  await expect(printSheet.locator('dt').filter({ hasText: /^Yaş$/ })).toHaveCount(0);
  await page.clock.fastForward(60_001);
  await expect(print).toBeDisabled();
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
}
