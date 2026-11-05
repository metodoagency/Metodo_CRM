import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LocalFileStorage, S3FileStorage, createStorage, newStorageKey } from '../server/storage.js';
import { prepareFile, originalFilename } from '../server/file-validation.js';
import { maxFileBytes } from '../shared/files.js';
import { readConfig } from '../server/config.js';

it('validates MIME and magic bytes, bounds input, rejects unsafe formats and scanner failures', async () => {
  const pdf = Buffer.from('%PDF-1.7\n%%EOF');
  expect((await prepareFile(pdf, 'application/pdf')).mime).toBe('application/pdf');
  await expect(prepareFile(pdf, 'image/png')).rejects.toThrow('FILE_TYPE_MISMATCH');
  await expect(prepareFile(Buffer.from('<svg/>'), 'image/svg+xml')).rejects.toThrow('INVALID_FILE_TYPE');
  await expect(prepareFile(Buffer.from('not a file'), 'application/pdf')).rejects.toThrow('FILE_TYPE_MISMATCH');
  await expect(prepareFile(Buffer.alloc(0), 'application/pdf')).rejects.toThrow('INVALID_FILE');
  await expect(prepareFile(Buffer.alloc(maxFileBytes + 1), 'application/pdf')).rejects.toThrow('FILE_TOO_LARGE');
  await expect(prepareFile(pdf, 'application/pdf', { scan: async () => 'infected' })).rejects.toThrow('FILE_REJECTED');
});
it('resizes photos and removes EXIF/XMP/ICC metadata before computing the stored checksum', async () => {
  const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).jpeg()
    .withExif({ IFD0: { Artist: 'Örnek Kamera' } }).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">Example location</x:xmpmeta>').toBuffer();
  expect((await sharp(input).metadata()).exif).toBeDefined();
  const file = await prepareFile(input, 'image/jpeg'); const meta = await sharp(file.data).metadata();
  expect(file.mime).toBe('image/webp'); expect(meta.width).toBe(1600); expect(meta.height).toBe(800);
  expect(meta.exif).toBeUndefined(); expect(meta.xmp).toBeUndefined(); expect(meta.icc).toBeUndefined();
  expect(file.sha256).toBe(createHash('sha256').update(file.data).digest('hex'));
  await expect(prepareFile(input.subarray(0, 20), 'image/jpeg')).rejects.toThrow();
});
it('stores local files under random keys, rejects traversal and never overwrites an existing key', async () => {
  await mkdir('.local/tmp', { recursive: true }); const root = await mkdtemp(resolve('.local/tmp/files-')); const storage = new LocalFileStorage(root); const key = newStorageKey();
  try {
    expect(key).toMatch(/^[a-f0-9]{64}$/); await storage.put(key, Buffer.from('example'));
    await expect(storage.put(key, Buffer.from('replace'))).rejects.toThrow(); expect(String(await storage.read(key))).toBe('example');
    await expect(storage.read('../outside')).rejects.toThrow('INVALID_FILE_KEY');
    expect(originalFilename('C:\\folder\\../../Örnek\r\nbelge.pdf')).toBe('Örnekbelge.pdf');
    expect(() => new LocalFileStorage('public/uploads')).toThrow();
    expect(createStorage(readConfig({ NODE_ENV: 'test' }))).toBeInstanceOf(LocalFileStorage);
  } finally { await storage.remove(key); await storage.remove(key); await rmdir(root); }
});
it('uses S3 path-style private objects and a signed download lasting exactly 300 seconds', async () => {
  let object = Buffer.alloc(0); const calls: { method: string; path: string; disposition?: string; cache?: string }[] = [];
  const server = createServer(async (req, reply) => {
    calls.push({ method: req.method!, path: req.url!.split('?')[0], disposition: req.headers['content-disposition'], cache: req.headers['cache-control'] });
    if (req.method === 'PUT') { const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); object = Buffer.concat(chunks); reply.end(); }
    else if (req.method === 'GET') { reply.setHeader('content-length', object.length); reply.end(object); }
    else { reply.statusCode = 204; reply.end(); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); if (!address || typeof address === 'string') throw Error('No server address');
  const storage = new S3FileStorage({ S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_REGION: 'example', S3_BUCKET: 'example-private', S3_ACCESS_KEY_ID: 'example-key', S3_SECRET_ACCESS_KEY: 'example-secret' });
  const key = newStorageKey();
  try {
    await storage.put(key, Buffer.from('example pdf'), 'application/pdf'); expect(String(await storage.read(key))).toBe('example pdf');
    const url = new URL(await storage.signedDownload(key)); expect(url.pathname).toBe(`/example-private/${key}`); expect(url.searchParams.get('X-Amz-Expires')).toBe('300'); expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
    await storage.remove(key); expect(calls.map(c => c.method)).toEqual(['PUT', 'GET', 'DELETE']);
    expect(calls[0].disposition).toBe('attachment; filename="attachment"'); expect(calls[0].cache).toBe('private, no-store');
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
