import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { decrypt, encrypt, encryptedFields } from '../server/crypto.js';
import { cleanupExamples, deletionPreview, examplePreview, purgeTrash } from '../server/lifecycle.js';
import { driveUrl, type ExternalResourceInfo } from '../shared/external-resources.js';
import { LocalFileStorage } from '../server/storage.js';
import sharp from 'sharp';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let seq = 0; let address = '';
const url = 'https://drive.google.com/file/d/ExampleCaseSensitive/view?resourcekey=ExampleSecretKey';
const storage = new LocalFileStorage('.local/tmp/resource-portraits');
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: unknown) { return app.inject({ method, url: path, remoteAddress: address,
  headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
async function club() { const response = await request('POST', '/api/clubs', { name: 'Örnek Kaynak Kulübü' }); expect(response.statusCode).toBe(201); const row = response.json<{ id: string; version: number }>(); await db.club.update({ where: { id: row.id }, data: { isExample: true } }); return row; }
async function create(parent?: { type: 'Club'; id: string }) {
  const response = await request('POST', '/api/resources', { name: 'Örnek Şahin Dosyası', kind: 'DOCUMENT', externalUrl: url, isExample: true, ...(parent ? { parent } : {}) });
  expect(response.statusCode, response.body).toBe(201); return response.json<ExternalResourceInfo>();
}
async function removeResource(id: string, version: number) { const preview = await request('GET', `/api/resources/${id}/delete-preview`); expect(preview.statusCode).toBe(200); return request('DELETE', `/api/resources/${id}`, { version, previewToken: preview.json().previewToken }); }
beforeAll(async () => { app = await buildApp({ db, storage, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com', FILE_STORAGE_MODE: 'drive' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(','); await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  address = `127.9.0.${++seq}`; const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } });
  expect(login.statusCode).toBe(200); cookie = String(login.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken;
  expect((await request('GET', '/api/admin/retention')).statusCode).toBe(200);
});
afterAll(async () => { vi.restoreAllMocks(); await app.close(); await db.$disconnect(); });
afterEach(async () => { const files = await db.attachment.findMany({ select: { storageKey: true } }); const jobs = await db.storageDeletion.findMany({ select: { storageKey: true } }); for (const file of [...files, ...jobs]) if (/^[a-f0-9]{64}$/.test(file.storageKey)) await storage.remove(file.storageKey); });

describe('sensitive paths: canonical external Drive resources', () => {
  it('validates resource links locally without accepting arbitrary sites, credentials or deceptive hosts', () => {
    for (const value of [url, 'https://drive.google.com/drive/u/0/folders/ExampleFolder', 'https://docs.google.com/document/d/ExampleDoc/edit']) expect(driveUrl.safeParse(value).success).toBe(true);
    for (const value of ['https://example.com/file/d/Example/view', 'https://drive.google.com.example.com/file/d/Example/view', 'https://name@drive.google.com/file/d/Example/view',
      'http://drive.google.com/file/d/Example/view', 'https://drive.google.com:8443/file/d/Example/view', 'https://drive.google.com/', 'javascript:alert(1)', url.replace('file', 'fi\nle'), url.replace('/file/', '\\file\\')]) expect(driveUrl.safeParse(value).success, value).toBe(false);
  });
  it('encrypts URLs, preserves resource keys/case, masks metadata and audits explicit versioned disclosure', async () => {
    const target = await club(); const row = await create({ type: 'Club', id: target.id }); const stored = await db.externalResource.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.externalUrl).toMatch(/^v1\./); expect(decrypt(stored.externalUrl, 'ExternalResource.externalUrl')).toBe(url); expect(stored.sourceUrl).toBeNull(); expect(stored.fieldProvenance).toEqual({});
    expect(encryptedFields.ExternalResource).toContain('externalUrl');
    for (const path of ['/api/resources?q=sahin', `/api/records/Club/${target.id}/resources`, '/api/overview', '/api/admin/access-log']) {
      const response = await request('GET', path); expect(response.statusCode, response.body).toBe(200);
      expect(response.body).not.toContain('ExampleSecretKey'); expect(response.body).not.toContain(stored.externalUrl);
    }
    expect((await request('GET', '/api/resources?q=sahin')).json().total).toBe(1);
    expect((await request('POST', `/api/resources/${row.id}/reveal`, { version: 99 })).statusCode).toBe(409);
    const start = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const response = await request('POST', `/api/resources/${row.id}/reveal`, { version: row.version }); clock.mockRestore();
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('no-store'); expect(response.json().externalUrl).toBe(url);
    expect(new Date(response.json().expiresAt).getTime()).toBe(start + 60_000);
    const events = await db.auditLog.findMany({ where: { entityId: row.id } }); expect(JSON.stringify(events)).not.toContain('ExampleSecretKey');
    const views = (await request('GET', '/api/admin/access-log')).json(); expect(views.items).toHaveLength(1); expect(views.items[0].field).toBe('externalUrl');
    expect((await request('PATCH', `/api/resources/${row.id}`, { version: 1, changes: { name: 'Örnek Yeni Başlık' } })).statusCode).toBe(200);
    expect(decrypt((await db.externalResource.findUniqueOrThrow({ where: { id: row.id } })).externalUrl, 'ExternalResource.externalUrl')).toBe(url);
    expect((await request('POST', `/api/resources/${row.id}/reveal`, { version: 1 })).statusCode).toBe(409);
  });
  it('shares one canonical resource across parents and purges one parent without deleting the library entry', async () => {
    const first = await club(); const second = await club(); const row = await create({ type: 'Club', id: first.id });
    expect((await request('POST', `/api/resources/${row.id}/links`, { version: 1, parent: { type: 'Club', id: second.id } })).statusCode).toBe(201);
    const oldPreview = (await request('GET', `/api/resources/${row.id}/delete-preview`)).json().previewToken;
    const connections = (await request('GET', `/api/resources/${row.id}/links`)).json(); expect(connections.total).toBe(2); expect(connections.items.map((item: { parent: { id: string } }) => item.parent.id).sort()).toEqual([first.id, second.id].sort()); expect(JSON.stringify(connections)).not.toContain('ExampleSecretKey');
    expect((await request('DELETE', `/api/records/Club/${first.id}`, { version: first.version })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: first.id } }); const plan = await deletionPreview(db, 'Club', first.id);
    expect(plan.result.counts.ExternalResource).toBeUndefined(); expect(plan.result.counts.ExternalResourceLink).toBe(1);
    await purgeTrash(db, trash.id, trash.version, first.version + 1, plan.result.previewToken);
    expect(await db.externalResource.count()).toBe(1); expect(await db.externalResourceLink.count()).toBe(1);
    expect((await request('GET', `/api/records/Club/${second.id}/resources`)).json().items[0].id).toBe(row.id);
    expect(await db.storageDeletion.count()).toBe(0);
    expect((await request('DELETE', `/api/resources/${row.id}`, { version: 2, previewToken: oldPreview })).json().code).toBe('STALE_PREVIEW');
  });
  it('rejects concurrent duplicate links and stale changes without multiplying canonical resources', async () => {
    const parent = await club(); const row = await create();
    const responses = await Promise.all([1, 2].map(() => request('POST', `/api/resources/${row.id}/links`, { version: 1, parent: { type: 'Club', id: parent.id } })));
    expect(responses.map(res => res.statusCode).sort()).toEqual([201, 409]); expect(await db.externalResource.count()).toBe(1); expect(await db.externalResourceLink.count()).toBe(1);
    expect((await request('POST', `/api/resources/${row.id}/links`, { version: 2, parent: { type: 'Club', id: parent.id } })).json().code).toBe('RESOURCE_ALREADY_LINKED');
    expect((await request('PATCH', `/api/resources/${row.id}`, { version: 1, changes: { name: 'Örnek Eski Değişiklik' } })).statusCode).toBe(409);
  });
  it('unlinks and restores a typed relationship while keeping the resource and its other links', async () => {
    const parent = await club(); const row = await create({ type: 'Club', id: parent.id }); const link = await db.externalResourceLink.findFirstOrThrow();
    expect((await request('DELETE', `/api/resources/${row.id}/links/${link.id}`, { version: 1, linkVersion: 1 })).statusCode).toBe(200);
    expect((await request('GET', `/api/records/Club/${parent.id}/resources`)).json().total).toBe(0); expect((await request('GET', '/api/resources')).json().total).toBe(1);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: link.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 2 })).statusCode).toBe(200);
    expect((await request('GET', `/api/records/Club/${parent.id}/resources`)).json().total).toBe(1);
    expect((await db.externalResource.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(3);
  });
  it('soft deletes/restores/purges a resource globally without storage jobs or external fetches', async () => {
    const target = await club(); const row = await create({ type: 'Club', id: target.id }); const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external fetch'));
    try {
      expect((await removeResource(row.id, 1)).statusCode).toBe(200);
      expect((await request('GET', `/api/records/Club/${target.id}/resources`)).json().total).toBe(0);
      expect((await request('POST', `/api/resources/${row.id}/reveal`, { version: 2 })).statusCode).toBe(404);
      let trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
      expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(200);
      expect((await request('GET', `/api/records/Club/${target.id}/resources`)).json().total).toBe(1);
      expect((await removeResource(row.id, 3)).statusCode).toBe(200);
      trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } }); const plan = await deletionPreview(db, 'ExternalResource', row.id);
      await purgeTrash(db, trash.id, trash.version, 4, plan.result.previewToken);
      expect(await db.externalResource.count()).toBe(0); expect(await db.externalResourceLink.count()).toBe(0); expect(await db.storageDeletion.count()).toBe(0); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('rejects missing auth/CSRF and foreign/deleted parents or resources', async () => {
    const target = await club(); const row = await create();
    expect((await app.inject({ url: '/api/resources' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/resources/${row.id}/reveal`, headers: { cookie, origin }, payload: { version: 1 } })).statusCode).toBe(403);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const foreign = await db.externalResource.create({ data: { ownerId: 'other', name: 'Örnek Yabancı', searchName: 'ornek yabanci', kind: 'DOCUMENT', externalUrl: encrypt(url, 'ExternalResource.externalUrl'), isExample: true } });
    expect((await request('POST', `/api/resources/${foreign.id}/reveal`, { version: 1 })).statusCode).toBe(404);
    await db.club.update({ where: { id: target.id }, data: { ownerId: 'other' } });
    expect((await request('POST', `/api/resources/${row.id}/links`, { version: 1, parent: { type: 'Club', id: target.id } })).statusCode).toBe(404);
    await db.club.update({ where: { id: target.id }, data: { ownerId: 'owner', deletedAt: new Date() } });
    expect((await request('POST', `/api/resources/${row.id}/links`, { version: 1, parent: { type: 'Club', id: target.id } })).statusCode).toBe(404);
    expect((await request('GET', `/api/records/Club/${target.id}/resources`)).statusCode).toBe(404);
  });
  it('enforces exactly one typed parent and deny-by-default retention/RLS, and blocks general uploads', async () => {
    const target = await club(); const row = await create();
    await expect(db.externalResourceLink.create({ data: { resourceId: row.id, name: 'Örnek Geçersiz Bağlantı' } })).rejects.toThrow();
    const preview = await request('POST', '/api/admin/retention/preview', { table: 'ExternalResource' }); expect(preview.statusCode, preview.body).toBe(200); expect(preview.json().total).toBe(0);
    const tables = await db.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`SELECT relname::text, relrowsecurity FROM pg_class WHERE relname IN ('ExternalResource','ExternalResourceLink') AND relnamespace='public'::regnamespace`;
    expect(tables).toHaveLength(2); expect(tables.every(table => table.relrowsecurity)).toBe(true);
    expect((await request('POST', `/api/records/Club/${target.id}/files`, {})).json().code).toBe('EXTERNAL_FILES_ONLY');
  });
  it('enforces example names and keeps a canonical non-example when only its example parent is cleaned', async () => {
    expect((await request('POST', '/api/resources', { name: 'Invalid example', kind: 'DOCUMENT', externalUrl: url, isExample: true })).json().code).toBe('EXAMPLE_NAME_REQUIRED');
    const example = await create(); expect((await request('PATCH', `/api/resources/${example.id}`, { version: 1, changes: { name: 'Invalid renamed example' } })).json().code).toBe('EXAMPLE_NAME_REQUIRED');
    const response = await request('POST', '/api/resources', { name: 'Örnek Bağımsız Kütüphane', kind: 'DOCUMENT', externalUrl: url }); expect(response.statusCode).toBe(201); const resource = response.json();
    const parent = await club(); expect((await request('POST', `/api/resources/${resource.id}/links`, { version: 1, parent: { type: 'Club', id: parent.id } })).statusCode).toBe(201);
    const plan = await examplePreview(db); await cleanupExamples(db, plan.result.previewToken);
    expect(await db.externalResource.count()).toBe(1); expect((await db.externalResource.findFirstOrThrow()).id).toBe(resource.id); expect(await db.externalResourceLink.count()).toBe(0);
  });
  it('allows only validated optimized portraits through the explicit image path while general uploads stay blocked', async () => {
    const player = (await request('POST', '/api/players', { name: 'Örnek Portre Oyuncusu', primaryPosition: 'CM' })).json();
    await db.player.update({ where: { id: player.id }, data: { isExample: true } });
    const multipart = (bytes: Buffer, mime: string) => Buffer.concat([Buffer.from(`--example-boundary\r\nContent-Disposition: form-data; name="file"; filename="Örnek portre"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from('\r\n--example-boundary--\r\n')]);
    const upload = (bytes: Buffer, mime: string) => app.inject({ method: 'POST', url: `/api/players/${player.id}/photo-files`, remoteAddress: address,
      headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': 'multipart/form-data; boundary=example-boundary' }, payload: multipart(bytes, mime) });
    expect((await request('GET', `/api/records/Player/${player.id}/files`)).json()).toMatchObject({ uploadAvailable: false, portraitUploadAvailable: true, mode: 'drive' });
    const image = await sharp({ create: { width: 1700, height: 20, channels: 3, background: '#d5bd91' } }).withMetadata().png().toBuffer();
    const result = await upload(image, 'image/png'); expect(result.statusCode, result.body).toBe(201); const file = await db.attachment.findUniqueOrThrow({ where: { id: result.json().id } });
    const metadata = await sharp(await storage.read(file.storageKey)).metadata(); expect(metadata.width).toBe(1600); expect(metadata.exif).toBeUndefined(); expect(file.entityType).toBe('Player'); expect(file.isExample).toBe(true);
    expect((await upload(Buffer.from('%PDF-1.7\n%%EOF'), 'application/pdf')).statusCode).toBe(400);
    expect((await upload(Buffer.from('%PDF-1.7\n%%EOF'), 'image/png')).statusCode).toBe(400);
    expect(await db.attachment.count()).toBe(1);
    expect((await request('POST', `/api/files/${file.id}/download`, { version: 1 })).statusCode).toBe(200);
    expect((await request('POST', `/api/records/Player/${player.id}/files`, {})).json().code).toBe('EXTERNAL_FILES_ONLY');
  });
  it('rechecks a Contract parent through its deleted Player when linking or restoring', async () => {
    const player = await db.player.create({ data: { name: 'Örnek Kaynak Oyuncusu', searchName: 'ornek kaynak oyuncusu', primaryPosition: 'CM', isExample: true } });
    const contract = await db.contract.create({ data: { name: 'Örnek Kaynak Sözleşmesi', playerId: player.id, type: 'EMPLOYMENT', startDate: new Date('2026-01-01'), endDate: new Date('2028-06-30'), isExample: true } });
    const response = await request('POST', '/api/resources', { name: 'Örnek Sözleşme Belgesi', kind: 'EMPLOYMENT_CONTRACT', externalUrl: url, parent: { type: 'Contract', id: contract.id } }); expect(response.statusCode, response.body).toBe(201); const row = response.json();
    const link = await db.externalResourceLink.findFirstOrThrow({ where: { resourceId: row.id } });
    expect((await request('DELETE', `/api/resources/${row.id}/links/${link.id}`, { version: 1, linkVersion: 1 })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: link.id } }); await db.player.update({ where: { id: player.id }, data: { deletedAt: new Date() } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 2 })).statusCode).toBe(404);
    expect((await request('POST', `/api/resources/${row.id}/links`, { version: 2, parent: { type: 'Contract', id: contract.id } })).statusCode).toBe(404);
    expect((await request('GET', `/api/records/Contract/${contract.id}/resources`)).statusCode).toBe(404);
    expect((await request('POST', `/api/resources/${row.id}/reveal`, { version: 2 })).statusCode).toBe(200);
  });
});
