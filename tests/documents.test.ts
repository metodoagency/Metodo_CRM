import { expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import JSZip from 'jszip';
import { documentHtml, renderDocument } from '../server/document-renderer.js';
import type { DocumentContent } from '../shared/documents.js';

const fixture: DocumentContent = {
  language: 'tr', title: 'Örnek ŞİĞ Çalışması', subtitle: 'Oyuncu profili',
  sections: [
    { heading: 'Kimlik ve kadro', lines: ['Kulüp · Örnek Kulüp'] },
    { heading: 'Oyun pozisyonları', lines: ['Pozisyon · Örnek İleri'] },
  ],
  footer: 'Veri tarihi 04.11.2026 · Kayıt sürümü 2 · Şablon profile-1',
};

it('prints an extractable Turkish PDF when Chromium is unavailable', async () => {
  const file = await renderDocument(fixture, 'pdf', '.local/no-chromium-for-fallback-test');
  expect(file.engine).toBe('pdfkit');
  const parser = new PDFParse({ data: new Uint8Array(file.bytes) });
  try {
    const result = await parser.getText();
    expect(result.text.replace(/\s+/g, ' ')).toContain(fixture.title);
    expect(result.text.replace(/\s+/g, ' ')).toContain(fixture.footer);
    expect(result.text.indexOf('Kimlik ve kadro')).toBeLessThan(result.text.indexOf('Oyun pozisyonları'));
  } finally {
    await parser.destroy();
  }
});

it('puts the same sections and version metadata in editable Word XML', async () => {
  const file = await renderDocument(fixture, 'docx');
  const zip = await JSZip.loadAsync(file.bytes);
  const main = await zip.file('word/document.xml')!.async('string');
  const footer = await zip.file('word/footer1.xml')!.async('string');
  expect(main).toContain(fixture.title);
  for (const section of fixture.sections) {
    expect(main).toContain(section.heading);
    for (const line of section.lines) expect(main).toContain(line);
  }
  expect(footer).toContain(fixture.footer);
});

it('escapes document text before it reaches the offline print page', () => {
  const html = documentHtml({ ...fixture, title: '<img src="https://example.com/remote">', subtitle: '<script>example</script>' });
  expect(html).not.toMatch(/<img |<script>/);
  expect(html).toContain('&lt;img src=&quot;https://example.com/remote&quot;&gt;');
  expect(html).toContain("default-src 'none'");
});
