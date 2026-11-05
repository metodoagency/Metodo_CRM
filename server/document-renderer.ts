import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { chromium } from 'playwright-core';
import { documentMime, type DocumentContent, type DocumentInput } from '../shared/documents.js';

const require = createRequire(import.meta.url);
const regular = readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff'));
const extended = readFileSync(require.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'));
const extendedTurkish = /[ĞğİŞş]/u;
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function documentHtml(content: DocumentContent) {
  const sections = content.sections.map(section => `<section><h2>${escape(section.heading)}</h2>${section.lines.map(line => `<p>${escape(line)}</p>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="${content.language}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:">
<style>
@font-face{font-family:Metodo;src:url(data:font/woff;base64,${regular.toString('base64')});}
@font-face{font-family:Metodo;src:url(data:font/woff;base64,${extended.toString('base64')});unicode-range:U+011E-011F,U+0130,U+015E-015F;}
body{font-family:Metodo,sans-serif;color:#172536;margin:0;font-size:11pt;line-height:1.45}
h1{font-size:26pt;margin:0;color:#103045}h2{font-size:14pt;margin:1.4em 0 .45em;border-bottom:1px solid #cad5dc;padding-bottom:.3em}
header{border-top:5px solid #147b73;padding-top:16pt}p{margin:.3em 0;overflow-wrap:anywhere}footer{margin-top:2em;color:#536775;font-size:9pt}h2{break-after:avoid}
</style></head><body><header><h1>${escape(content.title)}</h1><p>${escape(content.subtitle)}</p></header>${sections}<footer>${escape(content.footer)}</footer></body></html>`;
}

async function renderChromium(content: DocumentContent, executablePath?: string) {
  const browser = await chromium.launch({ executablePath: executablePath || undefined, headless: true, timeout: 8000 });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const context = await browser.newContext({ offline: true, javaScriptEnabled: false, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(documentHtml(content), { waitUntil: 'load', timeout: 8000 });
    const printed = page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '17mm', right: '17mm' } });
    const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Chromium print timed out')), 8000); });
    return await Promise.race([printed, deadline]);
  } finally {
    clearTimeout(timeout);
    await browser.close();
  }
}

function renderFallback(content: DocumentContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: content.title, Author: 'Metodo CRM' } });
    const chunks: Buffer[] = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.registerFont('Latin', regular).registerFont('Turkish', extended);
    function write(text: string, size: number, color: string) {
      const segments = text.normalize('NFC').match(/[ĞğİŞş]+|[^ĞğİŞş]+/gu) ?? [];
      pdf.fontSize(size).fillColor(color);
      for (const [index, segment] of segments.entries()) {
        pdf.font(extendedTurkish.test(segment) ? 'Turkish' : 'Latin').text(segment, { continued: index < segments.length - 1 });
      }
    }
    write(content.title, 24, '#103045');
    write(content.subtitle, 12, '#536775');
    for (const section of content.sections) {
      pdf.moveDown(.8);
      write(section.heading, 15, '#147b73');
      for (const line of section.lines) write(line, 11, '#172536');
    }
    pdf.moveDown(1.2);
    write(content.footer, 9, '#536775');
    pdf.end();
  });
}

async function renderWord(content: DocumentContent) {
  const children = [
    new Paragraph({ text: content.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: content.subtitle, color: '536775' })] }),
    ...content.sections.flatMap(section => [
      new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }),
      ...section.lines.map(line => new Paragraph({ text: line })),
    ]),
  ];
  return Packer.toBuffer(new Document({
    title: content.title,
    creator: 'Metodo CRM',
    sections: [{ children, footers: { default: new Footer({ children: [new Paragraph({ text: content.footer })] }) } }],
  }));
}

export async function renderDocument(content: DocumentContent, format: DocumentInput['format'], executablePath?: string) {
  if (format === 'docx') {
    return { bytes: await renderWord(content), mime: documentMime.docx, engine: 'docx' as const };
  }
  try {
    return { bytes: await renderChromium(content, executablePath), mime: documentMime.pdf, engine: 'chromium' as const };
  } catch {
    return { bytes: await renderFallback(content), mime: documentMime.pdf, engine: 'pdfkit' as const };
  }
}
