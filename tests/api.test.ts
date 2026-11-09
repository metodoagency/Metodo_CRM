import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { decrypt, encrypt } from '../server/crypto.js';
import { hash } from '../server/auth.js';
import { seedExamples, exampleId } from '../prisma/seed.js';
import { keyring } from '../server/crypto.js';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dailyJobs } from '../server/jobs.js';
import { apiContracts } from '../shared/contracts.js';
import { openapiDocument } from '../server/openapi.js';
import { MigrationPg } from '../scripts/migration-adapter.js';
import { LocalFileStorage, drainStorageDeletions } from '../server/storage.js';
import { DocumentProcessing, type DocumentProcessor } from '../server/processing.js';
import type { ProcessingPreview } from '../shared/files.js';
import { readFile } from 'node:fs/promises';
import { purgeTrash } from '../server/lifecycle.js';
import JSZip from 'jszip';

const fileStorage = new LocalFileStorage('.local/tmp/api-files');
const processingCalls: ProcessingPreview['payload'][] = [];
const processor: DocumentProcessor = { id: 'example-processor', revision: '1', location: 'external', destination: 'https://example.com/process', process: async payload => { processingCalls.push(payload); return { candidates: [{ salary: '100', excerpt: payload.text }] }; } };

const origin = 'http://localhost:5173';
let app: FastifyInstance; let cookie = ''; let csrf = ''; let loginIp = 1;
async function login(email = 'owner@example.com') {
  const res = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: `127.1.0.${loginIp++}`, headers: { origin }, payload: { email } });
  cookie = String(res.headers['set-cookie']).split(';')[0];
  if (res.statusCode === 200) csrf = (await app.inject({ url: '/api/me', headers: { cookie } })).json().csrfToken;
  return res;
}
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) { return app.inject({ method, url, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload }) }); }
async function club(name = 'Örnek Test Kulübü') { return (await request('POST', '/api/clubs', { name })).json(); }
beforeAll(async () => { app = await buildApp({ db, storage: fileStorage, processors: [processor], config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com', EXTERNAL_PROCESSING_ENABLED: 'true' }) }); });
beforeEach(async () => {
  processingCalls.length = 0; processor.destination = 'https://example.com/process';
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(m => `"${m.dbName || m.name}"`).join(',');
  await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  expect((await login()).statusCode).toBe(200);
});
afterEach(async () => {
  const files = await db.attachment.findMany({ select: { storageKey: true } }); const jobs = await db.storageDeletion.findMany({ select: { storageKey: true } });
  for (const file of [...files, ...jobs]) if (/^[a-f0-9]{64}$/.test(file.storageKey)) await fileStorage.remove(file.storageKey);
});
afterAll(async () => { await app.close(); await db.$disconnect(); });

const pdfFile = Buffer.from('%PDF-1.7\n%%EOF');
function uploadFile(id: string, data = pdfFile, mime = 'application/pdf', extra = '') {
  const boundary = 'example-boundary';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Örnek belge.pdf"\r\nContent-Type: ${mime}\r\n\r\n`), data, Buffer.from(`\r\n${extra}--${boundary}--\r\n`)]);
  return app.inject({ method: 'POST', url: `/api/records/Club/${id}/files`, payload, headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': `multipart/form-data; boundary=${boundary}` } });
}
async function processingPreview() {
  const entity = await club(); const file = (await uploadFile(entity.id)).json();
  const res = await request('POST', '/api/processing/preview', { attachmentId: file.id, attachmentVersion: file.version, adapterId: processor.id, text: 'Örnek özel sözleşme alıntısı' });
  expect(res.statusCode, res.body).toBe(201); return { preview: res.json() as ProcessingPreview, file, entity };
}
describe('sensitive paths: files and per-document processing', () => {
  it('stores an owner upload privately, logs value-free access, and blocks access through a deleted parent', async () => {
    const entity = await club(); const res = await uploadFile(entity.id); expect(res.statusCode, res.body).toBe(201);
    const file = res.json(); expect(res.body).not.toContain('storageKey'); expect(res.body).not.toContain('contentHash');
    const stored = await db.attachment.findUniqueOrThrow({ where: { id: file.id } });
    expect(stored.storageKey).toMatch(/^[a-f0-9]{64}$/); expect(stored.storageKey).not.toContain('belge');
    expect(await readFile(`.local/tmp/api-files/${stored.storageKey}`)).toEqual(pdfFile); expect(await db.storageDeletion.count()).toBe(0);
    expect((await app.inject({ url: `/api/files/${file.id}/content` })).statusCode).toBe(401);
    const signed = await request('POST', `/api/files/${file.id}/download`, { version: file.version }); expect(signed.json().expiresIn).toBe(300);
    const content = await request('GET', signed.json().url); expect(content.rawPayload).toEqual(pdfFile); expect(content.headers['content-disposition']).toContain('attachment'); expect(content.headers['cache-control']).toBe('no-store');
    const access = (await request('GET', '/api/admin/access-log')).json(); expect(access.items.some((item: { field: string }) => item.field === 'document')).toBe(true); expect(JSON.stringify(access)).not.toContain('PDF-1.7');
    expect((await request('POST', `/api/files/${file.id}/download`, { version: 99 })).statusCode).toBe(409);
    await request('DELETE', `/api/records/Club/${entity.id}`, { version: entity.version }); expect((await request('GET', signed.json().url)).statusCode).toBe(404);
  });
  it('rejects MIME spoofing, oversized and extra multipart parts before creating metadata', async () => {
    const entity = await club(); expect((await uploadFile(entity.id, pdfFile, 'image/png')).statusCode).toBe(400);
    expect((await uploadFile(entity.id, Buffer.alloc(10 * 1024 * 1024 + 1))).statusCode).toBe(413);
    expect((await uploadFile(entity.id, pdfFile, 'application/pdf', '--example-boundary\r\nContent-Disposition: form-data; name="unexpected"\r\n\r\nvalue\r\n')).statusCode).toBe(413);
    expect(await db.attachment.count()).toBe(0); expect(await db.storageDeletion.count()).toBe(0);
    expect((await app.inject({ method: 'POST', url: `/api/records/Club/${entity.id}/files`, headers: { cookie, origin } })).statusCode).toBe(403);
    expect((await uploadFile('00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
  });
  it('queues physical deletion atomically with the approved purge, retries failure, and protects referenced objects', async () => {
    const entity = await club(); const file = (await uploadFile(entity.id)).json(); const stored = await db.attachment.findUniqueOrThrow({ where: { id: file.id } });
    await db.storageDeletion.create({ data: { driver: 'local', storageKey: stored.storageKey, notBefore: new Date(0) } });
    expect((await drainStorageDeletions(db, fileStorage)).removed).toBe(0); expect(await fileStorage.read(stored.storageKey)).toEqual(pdfFile);
    await db.storageDeletion.deleteMany();
    await request('DELETE', `/api/records/Club/${entity.id}`, { version: entity.version }); const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: entity.id } });
    const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json();
    await purgeTrash(db, trash.id, trash.version, entity.version + 1, plan.previewToken);
    expect(await db.attachment.count()).toBe(0); expect(await db.storageDeletion.count()).toBe(1);
    const now = new Date(); const failedStorage = { ...fileStorage, driver: 'local' as const, put: fileStorage.put.bind(fileStorage), read: fileStorage.read.bind(fileStorage), remove: async () => { throw Error('example failure'); } };
    expect((await drainStorageDeletions(db, failedStorage, now)).removed).toBe(0); expect((await db.storageDeletion.findFirstOrThrow()).attempts).toBe(1);
    expect((await drainStorageDeletions(db, fileStorage, new Date(now.getTime() + 3600_001))).removed).toBe(1); await expect(fileStorage.read(stored.storageKey)).rejects.toThrow();
  });
  it('never calls an external adapter before exact consent and encrypts payload and output without canonical writes', async () => {
    const { preview, entity } = await processingPreview(); expect(processingCalls).toHaveLength(0);
    expect((await request('POST', `/api/processing/${preview.id}/run`, { version: 1 })).statusCode).toBe(403);
    expect((await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, approved: false, previewToken: preview.previewToken })).statusCode).toBe(400);
    expect((await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, approved: true, previewToken: 'a'.repeat(64) })).statusCode).toBe(409);
    const approved = await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, approved: true, previewToken: preview.previewToken }); expect(approved.statusCode).toBe(200);
    expect(processingCalls).toHaveLength(0);
    const run = await request('POST', `/api/processing/${preview.id}/run`, { version: approved.json().version }); expect(run.statusCode, run.body).toBe(200);
    expect(processingCalls).toEqual([preview.payload]);
    expect((await request('POST', `/api/processing/${preview.id}/run`, { version: approved.json().version })).statusCode).toBe(409);
    const stored = await db.processingConsent.findUniqueOrThrow({ where: { id: preview.id } });
    expect(stored.processingPayload).not.toContain(preview.payload.text); expect(decrypt(stored.processingPayload, 'ProcessingConsent.processingPayload')).toBe(JSON.stringify(preview.payload));
    expect(stored.processingResult).toMatch(/^v1\./); expect(JSON.stringify(await db.auditLog.findMany())).not.toContain(preview.payload.text);
    expect(await db.club.findUnique({ where: { id: entity.id } })).toMatchObject({ name: entity.name, version: entity.version }); expect(await db.updateProposal.count()).toBe(0);
  });
  it('drains storage only after an authenticated purge commits', async () => {
    const entity = await club(); const file = (await uploadFile(entity.id)).json();
    const stored = await db.attachment.findUniqueOrThrow({ where: { id: file.id } });
    await request('DELETE', `/api/records/Club/${entity.id}`, { version: entity.version });
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: entity.id } });
    const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json();
    const payload = { version: trash.version, recordVersion: entity.version + 1, previewToken: plan.previewToken };
    expect((await app.inject({ method: 'DELETE', url: `/api/trash/${trash.id}`, headers: { origin }, payload })).statusCode).toBe(401);
    expect(await fileStorage.read(stored.storageKey)).toEqual(pdfFile);
    expect((await request('DELETE', `/api/trash/${trash.id}`, payload)).statusCode).toBe(200);
    await expect.poll(() => db.storageDeletion.count({ where: { storageKey: stored.storageKey } }), { timeout: 5000 }).toBe(0);
    await expect(fileStorage.read(stored.storageKey)).rejects.toThrow();
  });
  it('rejects missing documents, stale document versions, changed destinations and expired previews', async () => {
    const { preview, file } = await processingPreview();
    processor.destination = 'https://example.com/changed';
    expect((await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, approved: true, previewToken: preview.previewToken })).statusCode).toBe(409);
    processor.destination = 'https://example.com/process'; await db.attachment.update({ where: { id: file.id }, data: { version: { increment: 1 } } });
    expect((await request('GET', `/api/processing/${preview.id}`)).statusCode).toBe(409);
    await db.attachment.update({ where: { id: file.id }, data: { version: 1 } }); await db.processingConsent.update({ where: { id: preview.id }, data: { expiresAt: new Date(0) } });
    expect((await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, approved: true, previewToken: preview.previewToken })).statusCode).toBe(409); expect(processingCalls).toHaveLength(0);
    expect((await request('POST', '/api/processing/preview', { adapterId: processor.id, attachmentId: '00000000-0000-4000-8000-000000000000', attachmentVersion: 1, text: 'Örnek' })).statusCode).toBe(404);
  });
  it('keeps external processing disabled by default and prevents replay after a processor failure', async () => {
    const { preview } = await processingPreview();
    const disabled = new DocumentProcessing(db, readConfig({ NODE_ENV: 'test' }), [processor]);
    await expect(disabled.run(preview.id, { version: 1 })).rejects.toMatchObject({ code: 'PROCESSING_UNAVAILABLE' }); expect(disabled.available()).toEqual([]);
    let calls = 0; const failed = new DocumentProcessing(db, readConfig({ NODE_ENV: 'test', EXTERNAL_PROCESSING_ENABLED: 'true' }), [{ ...processor, process: async () => { calls++; throw Error('example failure'); } }]);
    const approved = await failed.approve(preview.id, { version: 1, approved: true, previewToken: preview.previewToken });
    await expect(failed.run(preview.id, approved)).rejects.toThrow();
    // Run takes only a version: strict input also rejects an injected payload/id.
    await expect(failed.run(preview.id, { version: approved.version })).rejects.toMatchObject({ code: 'PROCESSING_FAILED' });
    await expect(failed.run(preview.id, { version: approved.version })).rejects.toMatchObject({ code: 'STALE_PREVIEW' }); expect(calls).toBe(1);
  });
  it('rejects altered encrypted payloads and allows only one concurrent execution of an approved preview', async () => {
    const { preview } = await processingPreview();
    await db.processingConsent.update({ where: { id: preview.id }, data: { processingPayload: encrypt(JSON.stringify({ ...preview.payload, text: 'Örnek değiştirilmiş metin' }), 'ProcessingConsent.processingPayload') } });
    expect((await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, previewToken: preview.previewToken, approved: true })).statusCode).toBe(409); expect(processingCalls).toHaveLength(0);
    await db.processingConsent.update({ where: { id: preview.id }, data: { processingPayload: encrypt(JSON.stringify(preview.payload), 'ProcessingConsent.processingPayload') } });
    const approved = (await request('POST', `/api/processing/${preview.id}/approve`, { version: 1, previewToken: preview.previewToken, approved: true })).json();
    const results = await Promise.all([request('POST', `/api/processing/${preview.id}/run`, { version: approved.version }), request('POST', `/api/processing/${preview.id}/run`, { version: approved.version })]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]); expect(processingCalls).toHaveLength(1);
  });
});

describe('club network', () => {
  it('counts and filters owner clubs and maps only valid coordinate pairs', async () => {
    const continent = (await request('POST', '/api/clubs/geography', { type: 'Continent', name: 'Örnek Kıta' })).json();
    const country = (await request('POST', '/api/clubs/geography', { type: 'Country', name: 'Örnek Ülke', isoCode: 'XA', continentId: continent.id })).json();
    const other = (await request('POST', '/api/clubs/geography', { type: 'Country', name: 'Örnek İkinci Ülke', isoCode: 'XB', continentId: continent.id })).json();
    const region = (await request('POST', '/api/clubs/geography', { type: 'Region', name: 'Örnek Bölge', countryId: country.id })).json();
    expect((await request('POST', '/api/clubs/geography', { type: 'Country', name: 'Örnek Tekrar', isoCode: 'xa', continentId: continent.id })).statusCode).toBe(409);
    const mapped = await club('Örnek Koordinatlı Kulüp');
    const missing = await club('Örnek Konumsuz Kulüp');
    const unassigned = await club('Örnek Ülkesiz Kulüp');
    const loc = { version: mapped.version, countryId: country.id, regionId: region.id, lat: 0, lng: 0, city: null, stadium: null, relationStatus: 'ACTIVE', isTracked: true };
    expect((await request('PATCH', `/api/clubs/${mapped.id}/location`, { ...loc, countryId: other.id })).statusCode).toBe(400);
    expect((await request('PATCH', `/api/clubs/${mapped.id}/location`, { ...loc, lat: null })).statusCode).toBe(400);
    expect((await request('PATCH', `/api/clubs/${mapped.id}/location`, { ...loc, lng: 181 })).statusCode).toBe(400);
    expect((await request('PATCH', `/api/clubs/${mapped.id}/location`, loc)).statusCode).toBe(200);
    expect((await request('PATCH', `/api/clubs/${mapped.id}/location`, loc)).statusCode).toBe(409);
    expect((await request('PATCH', `/api/clubs/${missing.id}/location`, { ...loc, version: missing.version, lat: null, lng: null })).statusCode).toBe(200);
    await db.club.create({ data: { name: 'Örnek Eski Hatalı Koordinat', searchName: 'ornek eski', countryId: country.id, regionId: region.id, lat: 92, lng: 10 } });
    await db.club.create({ data: { name: 'Örnek Silinmiş Kulüp', searchName: 'ornek silinmis', countryId: country.id, regionId: region.id, lat: 15, lng: 15, deletedAt: new Date() } });
    const tree = (await request('GET', '/api/clubs/geography')).json();
    expect(tree).toMatchObject({ total: 4, unassigned: 1, continents: [{ id: continent.id, count: 3 }], regions: [{ id: region.id, count: 3 }] });
    expect(tree.countries).toEqual(expect.arrayContaining([expect.objectContaining({ id: country.id, count: 3 }), expect.objectContaining({ id: other.id, count: 0 })]));
    const filter = `countryId=${country.id}&regionId=${region.id}`;
    const list = (await request('GET', `/api/clubs?${filter}`)).json();
    expect(list.total).toBe(3);
    expect((await request('GET', `/api/clubs/markers?${filter}`)).json().items).toEqual([{ id: mapped.id, name: mapped.name, lat: 0, lng: 0 }]);
    expect((await request('GET', '/api/clubs?countryCode=xa')).json().total).toBe(3);
    expect((await request('GET', '/api/clubs?countryCode=xb')).json().total).toBe(0);
    expect((await request('GET', '/api/clubs?unassigned=true')).json().items.map((row: { id: string }) => row.id)).toEqual([unassigned.id]);
    const events = await db.timelineEvent.findMany({ where: { entityId: mapped.id, action: 'update' } });
    expect(events).toHaveLength(1);
    expect(events[0].diffs).toMatchObject({ new: { relationStatus: 'ACTIVE', countryId: country.id, regionId: region.id } });
  });

  it('shows scoped club links and tenure history without exposing contacts or fetching sources', async () => {
    await seedExamples(db);
    const id = exampleId('club-0');
    const path = `/api/clubs/${id}/sections`;
    const staff = await request('GET', `${path}/staff`);
    expect(staff.statusCode).toBe(200);
    expect(staff.json().items).toEqual(expect.arrayContaining([expect.objectContaining({ href: `/record/Person/${exampleId('person-0-0')}`, label: 'HEAD_COACH', endDate: null })]));
    expect(staff.body).not.toContain('email');
    expect((await request('GET', `${path}/meetings`)).json().items).toHaveLength(2);
    expect((await request('GET', `${path}/requests`)).json().items).toHaveLength(1);
    expect((await request('GET', `${path}/players?players=suggested`)).json().items.length).toBeGreaterThan(0);
    const contact = await db.relation.create({ data: { fromType: 'Person', fromId: exampleId('person-0-0'), toType: 'Club', toId: id, relation: 'contactOf', isExample: true } });
    const activity = await request('GET', `${path}/relationship`);
    expect(activity.statusCode).toBe(200);
    expect(activity.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: contact.id, label: 'clubFirstContact' }),
      expect.objectContaining({ label: 'clubMeetings' }), expect.objectContaining({ label: 'clubPresentation' }),
      expect.objectContaining({ nameEn: expect.stringContaining('Suggested to') }),
    ]));
    await db.source.create({ data: { name: 'Örnek Kaynak', url: 'https://example.com/club-source', type: 'OFFICIAL', trustLevel: 'OFFICIAL', linkedClubIds: [id], isExample: true } });
    await db.source.create({ data: { name: 'Örnek Güvensiz Bağlantı', url: 'javascript:example()', type: 'OFFICIAL', trustLevel: 'OFFICIAL', linkedClubIds: [id], isExample: true } });
    const sources = (await request('GET', `${path}/sources`)).json().items;
    expect(sources).toEqual(expect.arrayContaining([expect.objectContaining({ href: 'https://example.com/club-source', external: true })]));
    expect(JSON.stringify(sources)).not.toContain('javascript:');
    const note = await request('POST', `/api/clubs/${id}/notes`, { text: 'Örnek Ofis Notu' });
    expect(note.statusCode).toBe(201);
    expect((await request('GET', `${path}/notes`)).json().items[0].name).toBe('Örnek Ofis Notu');
    expect((await app.inject({ url: `${path}/staff` })).statusCode).toBe(401);
    await db.club.update({ where: { id }, data: { deletedAt: new Date() } });
    expect((await request('GET', `${path}/staff`)).statusCode).toBe(404);
  });
});

describe('player database', () => {
  it('scores half-point criteria with versioned weights and keeps prior assessments when policy or position changes', async () => {
    const row = (await request('POST', '/api/players', { name: 'Örnek Puan Oyuncusu', primaryPosition: 'CM' })).json();
    const url = `/api/players/${row.id}/scoring`;
    const settings = (await request('GET', '/api/settings')).json();
    const initial = (await request('GET', url)).json();
    expect(initial).toMatchObject({ score: null, settingsVersion: settings.version, weights: [1, 1, 1] });
    expect((await request('PATCH', '/api/settings', { version: settings.version, levelWeights: { CM: [0, 0, 0] } })).statusCode).toBe(400);
    const policy = await request('PATCH', '/api/settings', { version: settings.version, levelWeights: { CM: [3, 1, 0] } });
    expect(policy.statusCode, policy.body).toBe(200);
    const entry = { version: row.version, settingsVersion: policy.json().version, scores: [7, 8, 1], note: 'Örnek değerlendirme' };
    expect((await request('PATCH', url, { ...entry, settingsVersion: settings.version })).statusCode).toBe(409);
    expect((await request('PATCH', url, { ...entry, scores: [7.1, 8, 1] })).statusCode).toBe(400);
    const first = await request('PATCH', url, entry);
    expect(first.statusCode, first.body).toBe(200); expect(first.json().score).toBe('7.5');
    expect((await request('GET', `/api/records/Player/${row.id}`)).json().levelScore).toBe('7.5');
    expect((await request('PATCH', url, entry)).statusCode).toBe(409);
    const snapshot = (await request('GET', url)).json();
    expect(snapshot.history).toMatchObject([{ score: 7.5, position: 'CM', weights: [3, 1, 0], note: entry.note }]);
    expect(await db.player.findUniqueOrThrow({ where: { id: row.id }, select: { levelSubscores: true } })).toEqual({ levelSubscores: { passing: 7, workRate: 8, vision: 1 } });
    await request('PATCH', '/api/settings', { version: snapshot.settingsVersion, levelWeights: { CM: [1, 3, 1] } });
    const unchanged = (await request('GET', url)).json();
    expect(unchanged).toMatchObject({ score: '7.5', weights: [1, 3, 1], history: [{ weights: [3, 1, 0] }] });
    expect((await request('PATCH', `/api/records/Player/${row.id}`, { version: snapshot.version, changes: { primaryPosition: 'CF' } })).statusCode).toBe(200);
    expect((await request('GET', url)).json()).toMatchObject({ position: 'CF', score: null, scores: null, history: [{ position: 'CM', score: 7.5 }] });
    expect(await db.timelineEvent.count({ where: { entityId: row.id, action: 'level_score' } })).toBe(1);
  });

  it('filters and sorts existing players with a safe currency boundary and allowlisted CSV', async () => {
    const target = await club();
    const created = await request('POST', '/api/players', { name: 'Örnek Şahin', primaryPosition: 'CM', status: 'OWN', currentClubId: target.id, birthDate: '2000-02-01' });
    expect(created.statusCode, created.body).toBe(201); const player = created.json();
    await db.player.update({ where: { id: player.id }, data: { tags: ['Örnek izlenecek'], levelScore: '7.0', marketValue: '123456.78', marketValueCurrency: 'EUR', notes: 'Örnek özel not', bio: 'Örnek özel metin', contractEndDate: new Date('2027-01-31') } });
    await request('POST', '/api/players', { name: 'Örnek Diğer', primaryPosition: 'CF', status: 'TARGET' });
    const query = `q=sahin&status=OWN&position=CM&clubId=${target.id}&tag=${encodeURIComponent('Örnek izlenecek')}&scoreMin=6.5&contractBefore=2027-02-01`;
    const result = await request('GET', `/api/players?${query}`);
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json()).toMatchObject({ total: 1, items: [{ id: player.id, tags: ['Örnek izlenecek'], birthDate: '***', levelScore: '7.0', marketValue: '123456.78' }] });
    expect(result.body).not.toContain('Örnek özel'); expect(result.body).not.toContain('2000-02-01'); expect(result.body).not.toContain('birthDateIndex');
    expect((await request('GET', '/api/players?sort=marketValue')).statusCode).toBe(400);
    expect((await request('GET', '/api/players?scoreMin=8&scoreMax=5')).statusCode).toBe(400);
    expect((await request('GET', '/api/players?sort=marketValue&currency=EUR')).json().total).toBe(1);
    await request('DELETE', `/api/records/Club/${target.id}`, { version: target.version });
    expect((await request('GET', '/api/players?q=sahin')).json().items[0].currentClub).toBeNull();
    const csv = await request('GET', '/api/players/export?q=sahin');
    expect(csv.statusCode, csv.body).toBe(200); expect(csv.body).toContain('123456.78'); expect(csv.body).toContain('Örnek Şahin');
    for (const secret of ['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes', 'fieldProvenance', 'Örnek özel']) expect(csv.body).not.toContain(secret);
    expect((await request('GET', '/api/export/Player')).body).not.toContain('Örnek özel');
    expect(await db.timelineEvent.count({ where: { action: 'export', entityType: 'Owner' } })).toBe(2);
  });

  it('applies bulk tags atomically against versions and restores saved views through Trash', async () => {
    const first = (await request('POST', '/api/players', { name: 'Örnek Etiket A', primaryPosition: 'CM' })).json();
    const second = (await request('POST', '/api/players', { name: 'Örnek Etiket B', primaryPosition: 'CM' })).json();
    const records = [first, second].map(row => ({ id: row.id, version: row.version }));
    expect((await request('POST', '/api/players/tags', { records: [{ ...records[0], version: 99 }, records[1]], mode: 'add', tag: 'Örnek hedef' })).statusCode).toBe(409);
    expect((await db.player.findUniqueOrThrow({ where: { id: second.id } })).tags).toEqual([]);
    expect((await request('POST', '/api/players/tags', { records, mode: 'add', tag: 'Örnek hedef' })).statusCode).toBe(200);
    expect((await request('GET', `/api/players?tag=${encodeURIComponent('Örnek hedef')}`)).json().total).toBe(2);
    const updates = await db.timelineEvent.findMany({ where: { entityType: 'Player', action: 'update' } });
    expect(updates).toHaveLength(2); expect(updates[0].batchId).toBe(updates[1].batchId);
    const viewInput = { name: 'Örnek İzleme', filters: { q: 'Etiket', status: 'TARGET', tag: 'Örnek hedef', sort: 'name', direction: 'desc' }, columns: ['position', 'tags', 'status'] };
    const created = await request('POST', '/api/players/views', viewInput);
    expect(created.statusCode, created.body).toBe(201); const view = created.json();
    expect((await request('GET', '/api/players/views')).json()).toMatchObject([{ id: view.id, ...viewInput }]);
    await db.savedView.create({ data: { name: 'Örnek Eski Görünüm', tableName: 'Player', filters: { legacy: true }, columns: [], sort: {} } });
    expect((await request('GET', '/api/players/views')).json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Örnek Eski Görünüm', unavailable: true })]));
    expect((await request('DELETE', `/api/players/views/${view.id}`, { version: view.version })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: view.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: view.version + 1 })).statusCode).toBe(200);
    expect((await request('GET', '/api/players/views')).json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: view.id, version: view.version + 2 })]));
  });
});

describe('club source and update registry', () => {
  it('manages manual sources with multiple live club links, versions and trash restore', async () => {
    const first = await club('Örnek Kaynak A'); const second = await club('Örnek Kaynak B');
    const input = { name: 'Örnek Kulüp Kaynağı', type: 'OFFICIAL', url: 'https://example.com/news', trustLevel: 'OFFICIAL', linkedClubIds: [first.id, second.id] };
    expect((await request('POST', '/api/sources', { ...input, scanMethod: 'RSS' })).statusCode).toBe(400);
    expect((await request('POST', '/api/sources', { ...input, url: 'javascript:alert(1)' })).statusCode).toBe(400);
    expect((await request('POST', '/api/sources', { ...input, url: 'https://user:secret@example.com/news' })).statusCode).toBe(400);
    const created = await request('POST', '/api/sources', input);
    expect(created.statusCode, created.body).toBe(201);
    const source = created.json();
    expect(source).toMatchObject({ scanMethod: 'MANUAL', linkedClubIds: [first.id, second.id], version: 1 });
    const filtered = await request('GET', `/api/sources?clubId=${first.id}`);
    expect(filtered.json().items).toMatchObject([{ id: source.id, clubs: [{ id: first.id, name: first.name }, { id: second.id, name: second.name }] }]);
    const updated = await request('PATCH', `/api/sources/${source.id}`, { ...input, version: 1, linkedClubIds: [second.id] });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await request('PATCH', `/api/sources/${source.id}`, { ...input, version: 1 })).statusCode).toBe(409);
    expect((await request('GET', `/api/clubs/${first.id}/sections/sources`)).json().items).toEqual([]);
    expect((await request('GET', `/api/clubs/${second.id}/sections/sources`)).json().items).toMatchObject([{ href: input.url, external: true }]);
    expect((await request('DELETE', `/api/sources/${source.id}`, { version: 2 })).statusCode).toBe(200);
    expect((await request('GET', '/api/sources')).json().items).toEqual([]);
    const item = await db.trashEntry.findFirstOrThrow({ where: { entityId: source.id } });
    expect((await request('POST', `/api/trash/${item.id}/restore`, { version: item.version, recordVersion: 3 })).statusCode).toBe(200);
    expect((await request('GET', '/api/sources')).json().items).toMatchObject([{ id: source.id, version: 4 }]);
  });

  it('applies a verified stadium update only after approval and keeps injury notices metadata-only', async () => {
    const target = await club(); const url = `/api/clubs/${target.id}/update-proposals`;
    const evidence = { date: '2026-01-12', sourceUrl: 'https://example.com/statement' };
    const draft = { ...evidence, type: 'stadium', name: 'Örnek Duyuru', summary: 'Örnek stadyum değişikliği', stadium: 'Örnek Stadyum' };
    const created = await request('POST', url, draft);
    expect(created.statusCode, created.body).toBe(201);
    const proposal = created.json();
    expect((await db.club.findUniqueOrThrow({ where: { id: target.id } })).stadium).toBeNull();
    expect((await request('GET', '/api/overview')).json().pendingUpdates).toMatchObject([{ id: proposal.id }]);
    const route = `/api/proposals/${proposal.id}`;
    const preview = await request('GET', `${route}/context`);
    expect(preview.json()).toMatchObject({ kind: 'news', club: { stadium: null, version: target.version }, update: { stadium: draft.stadium } });
    const input = { action: 'approve', sourceUrl: evidence.sourceUrl, version: proposal.version, clubVersion: target.version,
      update: { name: draft.name, summary: draft.summary, date: evidence.date, stadium: 'Örnek Düzeltilen Stadyum' } };
    expect((await request('POST', `${route}/review`, { ...input, clubVersion: target.version + 1 })).statusCode).toBe(409);
    expect((await request('POST', `${route}/review`, { ...input, sourceUrl: undefined })).statusCode).toBe(400);
    const applied = await request('POST', `${route}/review`, input);
    expect(applied.statusCode, applied.body).toBe(200);
    expect(await db.club.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ stadium: input.update.stadium, fieldProvenance: { stadium: { sourceUrl: evidence.sourceUrl, verificationStatus: 'VERIFIED' } } });
    expect((await request('POST', `${route}/review`, input)).statusCode).toBe(404);
    expect((await request('POST', url, { ...evidence, type: 'injury', summary: 'Örnek sağlık ayrıntısı' })).statusCode).toBe(400);
    const injury = await request('POST', url, { ...evidence, type: 'injury' });
    expect(injury.statusCode, injury.body).toBe(201);
    expect(injury.json()).toMatchObject({ type: 'injury', summary: '', payload: {} });
    expect((await request('POST', `/api/proposals/${injury.json().id}/review`, { ...input, version: 1, clubVersion: target.version + 1, update: { date: evidence.date, summary: 'Örnek sağlık ayrıntısı' } })).statusCode).toBe(400);
  });
});

describe('club staff approval', () => {
  it('imports validated TFF CSV as pending proposals, binding the preview and deduplicating after review', async () => {
    const team = await club();
    const person = (await request('POST', '/api/people', { name: 'Örnek, CSV Adayı', role: 'HEAD_COACH' })).json();
    const endpoint = `/api/clubs/${team.id}/staff-import`;
    const header = '\uFEFFaction;person;role;effectiveDate;sourceUrl\r\n';
    const row = 'coach_appointment;"Örnek, CSV Adayı";HEAD_COACH;2026-01-12;https://www.tff.org/example';
    const csv = `${header}${row}\r\n${row}`;
    const invalid = (await request('POST', `${endpoint}/preview`, { csv: `${header}${row.replace('www.tff.org', 'www.tff.org.example.com')}` })).json();
    expect(invalid).toMatchObject({ issues: [{ line: 2, code: 'ROW' }], previewToken: null });
    const preview = (await request('POST', `${endpoint}/preview`, { csv })).json();
    expect(preview.rows).toMatchObject([{ line: 2, person: 'Örnek, CSV Adayı', duplicate: false }, { line: 3, duplicate: true }]);
    expect(await db.updateProposal.count()).toBe(0);
    expect((await request('POST', `${endpoint}/apply`, { csv: csv.replace('2026-01-12', '2026-01-13'), previewToken: preview.previewToken })).statusCode).toBe(409);
    const applied = await request('POST', `${endpoint}/apply`, { csv, previewToken: preview.previewToken });
    expect(applied.statusCode, applied.body).toBe(201);
    expect(applied.json().ids).toHaveLength(1);
    const proposal = await db.updateProposal.findFirstOrThrow();
    expect(proposal).toMatchObject({ approvalStatus: 'PENDING', sourceType: 'TFF', verificationStatus: 'UNVERIFIED' });
    expect(await db.relation.count()).toBe(0);
    const context = (await request('GET', `/api/proposals/${proposal.id}/context`)).json();
    expect(context.candidate).toMatchObject({ person: 'Örnek, CSV Adayı', role: 'HEAD_COACH', effectiveDate: '2026-01-12' });
    const approval = await request('POST', `/api/proposals/${proposal.id}/review`, { action: 'approve', personId: person.id, version: proposal.version,
      personVersion: person.version, clubVersion: team.version, effectiveDate: '2026-01-12', staffRole: 'HEAD_COACH', sourceUrl: proposal.sourceUrl });
    expect(approval.statusCode, approval.body).toBe(200);
    expect(await db.relation.findFirstOrThrow()).toMatchObject({ sourceType: 'TFF', verificationStatus: 'VERIFIED' });
    expect((await request('POST', `${endpoint}/preview`, { csv })).json()).toMatchObject({ previewToken: null, rows: [{ duplicate: true }, { duplicate: true }] });
    expect((await request('POST', `${endpoint}/apply`, { csv, previewToken: preview.previewToken })).statusCode).toBe(409);
  });

  async function setup(type: 'coach_departure' | 'coach_appointment') {
    const team = await club();
    const person = async (name: string, role: 'HEAD_COACH' | 'ASSISTANT') => {
      const result = await request('POST', '/api/people', { name, role });
      expect(result.statusCode, result.body).toBe(201);
      return result.json<{ id: string; version: number }>();
    };
    const [head, assistant, candidate] = await Promise.all([
      person('Örnek Teknik Direktör', 'HEAD_COACH'), person('Örnek Yardımcı', 'ASSISTANT'), person('Örnek Aday', 'HEAD_COACH'),
    ]);
    const startDate = new Date('2024-01-01T00:00:00Z');
    const tenure = (personId: string, role: string | null) => db.relation.create({ data: { fromType: 'Person', fromId: personId, toType: 'Club', toId: team.id, relation: 'memberOf', role, startDate } });
    const [headTenure, headOtherRole, assistantTenure] = await Promise.all([
      tenure(head.id, null), tenure(head.id, 'YOUTH_COORDINATOR'), tenure(assistant.id, 'ASSISTANT'),
    ]);
    const created = await request('POST', `/api/clubs/${team.id}/staff-proposals`, { name: 'Örnek Personel Önerisi', type, summary: 'Örnek kaynaklı değişiklik' });
    expect(created.statusCode, created.body).toBe(201);
    const proposal = created.json<{ id: string; version: number; approvalStatus: string }>();
    expect(proposal.approvalStatus).toBe('PENDING');
    expect(await db.relation.count({ where: { toId: team.id } })).toBe(3);
    const route = `/api/proposals/${proposal.id}`;
    const context = async () => {
      const result = await request('GET', `${route}/context`);
      expect(result.statusCode, result.body).toBe(200);
      return result.json().people.find((row: { id: string }) => row.id === head.id);
    };
    const review = (details: Record<string, unknown>) => request('POST', `${route}/review`, {
      action: 'approve', version: proposal.version, clubVersion: team.version, effectiveDate: '2025-01-15', sourceUrl: 'https://example.com/notice', ...details,
    });
    const endDate = async (id: string) => (await db.relation.findUniqueOrThrow({ where: { id } })).endDate;
    return { team, head, assistant, candidate, headTenure, headOtherRole, assistantTenure, proposal, context, review, endDate };
  }

  it('closes only the explicitly selected departing person and logs an atomic follow-up', async () => {
    const { team, head, headTenure, headOtherRole, assistantTenure, context, review, endDate } = await setup('coach_departure');
    expect((await review({})).json().code).toBe('PERSON_REQUIRED');
    expect(await endDate(headTenure.id)).toBeNull();
    const selection = await context();
    const result = await review({ personId: head.id, personVersion: selection.version, tenureToken: selection.tenureToken });
    expect(result.statusCode, result.body).toBe(200);
    expect(await endDate(headTenure.id)).toEqual(new Date('2025-01-15T00:00:00Z'));
    expect(await endDate(headOtherRole.id)).toEqual(new Date('2025-01-15T00:00:00Z'));
    expect(await endDate(assistantTenure.id)).toBeNull();
    expect(await db.task.findFirst({ where: { entityId: team.id, priority: 'HIGH' } })).not.toBeNull();
    const events = await db.timelineEvent.findMany({ where: { action: 'coach_departure' } });
    expect(events.map(row => row.entityId)).toEqual(expect.arrayContaining([team.id, head.id]));
    expect(new Set(events.map(row => row.batchId)).size).toBe(1);
  });

  it('creates an appointment without closing any open tenure when no predecessor is selected', async () => {
    const { team, candidate, headTenure, assistantTenure, review, endDate } = await setup('coach_appointment');
    const approval = { personId: candidate.id, personVersion: candidate.version, staffRole: 'HEAD_COACH' };
    expect(await db.relation.count({ where: { fromId: candidate.id } })).toBe(0);
    const result = await review(approval);
    expect(result.statusCode, result.body).toBe(200);
    const created = await db.relation.findFirstOrThrow({ where: { fromId: candidate.id, toId: team.id } });
    expect(created).toMatchObject({ role: 'HEAD_COACH', startDate: new Date('2025-01-15T00:00:00Z'), sourceUrl: 'https://example.com/notice', verificationStatus: 'VERIFIED' });
    expect(await endDate(headTenure.id)).toBeNull();
    expect(await endDate(assistantTenure.id)).toBeNull();
    expect((await review(approval)).statusCode).toBe(404);
    expect(await db.relation.count({ where: { fromId: candidate.id } })).toBe(1);
  });

  it('rejects a stale predecessor selection and ends only the selected head coach role after refresh', async () => {
    const { head, candidate, headTenure, headOtherRole, assistantTenure, proposal, context, review, endDate } = await setup('coach_appointment');
    const approval = { personId: candidate.id, personVersion: candidate.version, staffRole: 'HEAD_COACH' };
    const initial = await context();
    await db.relation.update({ where: { id: headTenure.id }, data: { version: { increment: 1 } } });
    expect((await review({ ...approval, predecessor: { personId: head.id, version: initial.version, tenureToken: initial.headCoachToken } })).json().code).toBe('PREVIEW_STALE');
    expect(await db.relation.count({ where: { fromId: candidate.id } })).toBe(0);
    expect((await db.updateProposal.findUniqueOrThrow({ where: { id: proposal.id } })).approvalStatus).toBe('PENDING');
    const refreshed = await context();
    const result = await review({ ...approval, predecessor: { personId: head.id, version: refreshed.version, tenureToken: refreshed.headCoachToken } });
    expect(result.statusCode, result.body).toBe(200);
    expect(await endDate(headTenure.id)).toEqual(new Date('2025-01-15T00:00:00Z'));
    expect(await endDate(headOtherRole.id)).toBeNull();
    expect(await endDate(assistantTenure.id)).toBeNull();
  });
});

describe('security baseline', () => {
  it('exports a versioned English profile with provenance and excludes sensitive data', async () => {
    const source = { sourceUrl: 'https://example.com/profile-source', sourceType: 'OFFICIAL', retrievedAt: '2026-11-02T00:00:00Z', verificationStatus: 'VERIFIED' };
    const player = (await request('POST', '/api/players', {
      name: 'Örnek ŞĞİ Profili', primaryPosition: 'CM', birthDate: '2000-02-01', fieldProvenance: { name: source },
    })).json();
    await db.player.update({ where: { id: player.id }, data: { healthNotes: encrypt('Örnek hassas sağlık kaydı', 'Player.healthNotes'), notes: 'Örnek özel not', heightCm: 181 } });
    const path = `/api/documents/profile/${player.id}`;
    const input = { format: 'docx', language: 'en', version: player.version };
    expect((await app.inject({ method: 'POST', url: path, headers: { origin }, payload: input })).statusCode).toBe(401);
    expect((await request('POST', path, { ...input, version: 99 })).statusCode).toBe(409);
    expect((await request('POST', path, { ...input, includeSensitive: true })).statusCode).toBe(400);
    const result = await request('POST', path, input);
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-disposition']).toContain('metodo-profile-en.docx');
    const zip = await JSZip.loadAsync(result.rawPayload);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Player profile');
    expect(xml).toContain(source.sourceUrl);
    expect(xml).toContain('Height (cm) · 181');
    expect(xml).not.toMatch(/2000-02-01|hassas sağlık kaydı|Örnek özel not|v1\.dev\./);
    expect(await zip.file('word/footer1.xml')!.async('string')).toContain('Record version 1');
    const logged = await db.timelineEvent.findFirstOrThrow({ where: { entityId: player.id, action: 'export' } });
    expect(logged.diffs).toMatchObject({ format: 'docx', language: 'en', template: 'profile-1', sourceVersions: [{ type: 'Player', id: player.id, version: 1 }], snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it('keeps procedural migration batches intact and rolls back a failed batch', async () => {
    const adapter = await new MigrationPg({ connectionString: process.env.DATABASE_URL }).connect();
    try {
      await adapter.executeScript("DO $test$ BEGIN PERFORM length('a;b'); PERFORM 1; END $test$; SELECT 1;");
      await expect(adapter.executeScript('CREATE TABLE "_MetodoMigrationAtomicTest" (id int); DO $test$ BEGIN RAISE EXCEPTION \'expected migration failure\'; END $test$;')).rejects.toThrow();
      const rows = await db.$queryRaw<{ name: string | null }[]>`SELECT to_regclass('public."_MetodoMigrationAtomicTest"')::text AS name`;
      expect(rows[0].name).toBeNull();
    } finally { await db.$executeRawUnsafe('DROP TABLE IF EXISTS "_MetodoMigrationAtomicTest"'); await adapter.dispose(); }
  });
  it('enables row security for every CRM table and never grants the public role table access', async () => {
    const names = [...Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name), '_prisma_migrations'];
    const rows = await db.$queryRaw<{ name: string; enabled: boolean }[]>(Prisma.sql`SELECT c.relname::text AS name, c.relrowsecurity AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname::text IN (${Prisma.join(names)})`);
    expect(rows).toHaveLength(names.length); expect(rows.every(row => row.enabled)).toBe(true);
    const grants = await db.$queryRaw<{ table_name: string }[]>(Prisma.sql`SELECT table_name::text FROM information_schema.table_privileges WHERE table_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated') AND table_name IN (${Prisma.join(names)})`);
    expect(grants).toEqual([]);
  });
  it('version-checks privacy acknowledgement, preserves it across sessions and renews outdated notices', async () => {
    const state = (await request('GET', '/api/privacy')).json();
    expect(state.acknowledgementRequired).toBe(true);
    expect((await request('POST', '/api/privacy/acknowledge', { version: state.version, noticeVersion: 'old', language: 'tr' })).statusCode).toBe(400);
    expect((await request('POST', '/api/privacy/acknowledge', { version: state.version + 1, noticeVersion: state.noticeVersion, language: 'tr' })).statusCode).toBe(409);
    const input = { version: state.version, noticeVersion: state.noticeVersion, language: 'en' };
    expect((await request('POST', '/api/privacy/acknowledge', input)).statusCode).toBe(200);
    expect((await request('POST', '/api/privacy/acknowledge', input)).statusCode).toBe(200);
    await login(); expect((await request('GET', '/api/privacy')).json().acknowledgementRequired).toBe(false);
    const saved = await db.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } });
    expect(saved.privacyAcknowledgedLanguage).toBe('en'); expect(saved.privacyAcknowledgedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { entityId: saved.id } })).toBe(1);
    await db.userSettings.update({ where: { id: saved.id }, data: { privacyNoticeVersion: 'older' } });
    expect((await request('GET', '/api/privacy')).json().acknowledgementRequired).toBe(true);
  });
  it('encrypts incident contact, masks settings and logs reveals without the value', async () => {
    const state = (await request('GET', '/api/privacy')).json(); const value = 'incident@example.com';
    expect((await request('PATCH', '/api/privacy/incident-contact', { version: state.version, value })).statusCode).toBe(200);
    expect((await request('PATCH', '/api/privacy/incident-contact', { version: state.version, value: 'replacement@example.com' })).statusCode).toBe(409);
    const saved = await db.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } });
    expect(saved.breachContact).not.toContain(value); expect(decrypt(saved.breachContact!, 'UserSettings.breachContact')).toBe(value);
    expect((await request('GET', '/api/settings')).body).not.toContain(saved.breachContact!);
    expect((await request('PATCH', '/api/settings', { version: saved.version, theme: 'light' })).body).not.toContain(saved.breachContact!);
    expect((await request('GET', '/api/privacy')).body).not.toContain(value);
    const reveal = await request('POST', '/api/privacy/incident-contact/reveal');
    expect(reveal.json()).toEqual({ value, expiresIn: 60 });
    const audit = await db.auditLog.findMany({ where: { entityId: saved.id } });
    expect(JSON.stringify(audit)).not.toContain(value); expect(audit.filter(row => row.action === 'reveal')).toHaveLength(1);
    expect((await request('POST', '/api/privacy/incident-contact/reveal', { extra: value })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/privacy/incident-contact/reveal', headers: { cookie, origin } })).statusCode).toBe(403);
  });
  it('returns 401 without authentication and 403 outside the allowlist (R15)', async () => {
    expect((await app.inject('/api/clubs')).statusCode).toBe(401);
    expect((await login('outsider@example.com')).statusCode).toBe(403);
  });
  it('sets secure __Host cookies and stores only a session hash', async () => {
    const res = await login(); const value = String(res.headers['set-cookie']);
    expect(value).toContain('__Host-metodo_session='); for (const flag of ['HttpOnly', 'Secure', 'SameSite=None', 'Path=/']) expect(value).toContain(flag); expect(value).not.toContain('Domain=');
    const token = decodeURIComponent(cookie.split('=')[1]); const session = await db.session.findUniqueOrThrow({ where: { id: hash(token) } });
    expect(session.id).not.toBe(token); expect(session.email).not.toContain('@'); expect(decrypt(session.email, 'Session.email')).toBe('owner@example.com');
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBeLessThanOrEqual(12 * 3600_000);
  });
  it('expires idle sessions and sessions older than 12 hours', async () => {
    await db.session.updateMany({ data: { lastSeenAt: new Date(Date.now() - 61 * 60000) } });
    expect((await request('GET', '/api/me')).statusCode).toBe(401);
    await login(); await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request('GET', '/api/me')).statusCode).toBe(401);
  });
  it('revokes all sessions on request', async () => { expect((await request('POST', '/api/logout-all')).statusCode).toBe(200); expect((await request('GET', '/api/me')).statusCode).toBe(401); });
  it('rejects missing or incorrect CSRF and hostile Origin', async () => {
    for (const headers of [{ cookie, origin }, { cookie, origin, 'x-csrf-token': 'bad' }, { cookie, origin: 'https://example.com', 'x-csrf-token': csrf }]) {
      expect((await app.inject({ method: 'POST', url: '/api/clubs', headers, payload: { name: 'Örnek Kulüp' } })).statusCode).toBe(403);
    }
  });
  it('sends Sites embedding CSP and never X-Frame-Options (R14)', async () => {
    const res = await app.inject('/healthz'); expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self' https://sites.google.com https://*.google.com");
    expect(res.headers['x-frame-options']).toBeUndefined(); expect(res.headers['x-content-type-options']).toBe('nosniff'); expect(res.headers['permissions-policy']).toContain('camera=()');
  });
  it('never registers test auth in production', async () => {
    const prod = await buildApp({ db, config: { ...readConfig(), NODE_ENV: 'production', APP_ORIGIN: 'https://example.com', testAuth: false, allowedEmails: ['owner@example.com'] } });
    expect((await prod.inject({ method: 'POST', url: '/auth/test', headers: { origin: 'https://example.com' }, payload: { email: 'owner@example.com' } })).statusCode).toBe(404); await prod.close();
    expect(readConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://example:production@localhost/metodo', DIRECT_URL: 'postgresql://example:production@localhost/metodo', APP_ORIGIN: 'https://example.com', GOOGLE_REDIRECT_URI: 'https://example.com/auth/google/callback', ALLOWED_EMAILS: 'owner@example.com', E2E_TEST_MODE: 'true', GOOGLE_CLIENT_ID: 'example', GOOGLE_CLIENT_SECRET: 'example', FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'), BLIND_INDEX_KEY: randomBytes(32).toString('base64') }).testAuth).toBe(false);
  });
  it('rejects an OAuth callback without state or its binding cookie', async () => expect((await app.inject('/auth/google/callback?code=example&state=example')).statusCode).toBe(400));
  it('does not bypass owner authentication with encoded path variants', async () => {
    for (const url of ['/a%70i/clubs', '/api%2fclubs', '//api/clubs', '/api/clubs/../players']) {
      const result = await app.inject(url); expect([401, 404, 400]).toContain(result.statusCode);
    }
  });
});

describe('records and persistence', () => {
  it('migrates every business primary key as a native PostgreSQL UUID', async () => {
    const columns = await db.$queryRaw<{ table_name: string; data_type: string }[]>`SELECT table_name::text, data_type::text FROM information_schema.columns WHERE table_schema='public' AND column_name='id'`;
    const byTable = new Map(columns.map(c => [c.table_name, c.data_type]));
    for (const model of Prisma.dmmf.datamodel.models.filter(m => !['Owner', 'Session', 'OAuthAttempt'].includes(m.name))) expect(byTable.get(model.name), model.name).toBe('uuid');
  });
  it('creates a normalized club and a timeline event', async () => {
    const row = await club('Örnek Şahin'); expect(row.id).toMatch(/^[a-f0-9-]{36}$/); expect(row.version).toBe(1);
    expect((await request('GET', '/api/clubs?q=Sahin')).json().total).toBe(1);
    expect((await request('GET', `/api/records/Club/${row.id}/timeline`)).json()).toHaveLength(1);
  });
  it('rejects mass assignment, invalid dates, fake verification and identity identifiers', async () => {
    expect((await request('POST', '/api/clubs', { name: 'Örnek', ownerId: 'other' })).statusCode).toBe(400);
    expect((await request('POST', '/api/clubs', { name: 'Örnek', verificationStatus: 'VERIFIED' })).statusCode).toBe(400);
    expect((await request('POST', '/api/players', { name: 'Örnek', primaryPosition: 'CF', birthDate: '2026-02-30' })).statusCode).toBe(400);
    expect((await request('POST', '/api/players', { name: 'Örnek', primaryPosition: 'CF', passportNumber: 'example' })).statusCode).toBe(400);
  });
  it('encrypts birth dates, masks response/timeline and excludes sensitive CSV fields (R6)', async () => {
    const res = await request('POST', '/api/players', { name: 'Örnek Oyuncu', primaryPosition: 'CF', birthDate: '2000-02-01' });
    expect(res.statusCode).toBe(201); expect(res.json().birthDate).toBe('***');
    const row = await db.player.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(row.birthDate).not.toContain('2000-02-01'); expect(decrypt(row.birthDate!, 'Player.birthDate')).toBe('2000-02-01');
    const timeline = (await request('GET', `/api/records/Player/${row.id}/timeline`)).body;
    expect(timeline).not.toContain('2000-02-01'); expect(timeline).toContain('***');
    const exported = await request('GET', '/api/export/Player');
    expect(exported.body).not.toContain('birthDate'); expect(exported.body).not.toContain('2000-02-01');
    const revealed = await request('POST', `/api/records/Player/${row.id}/reveal`, { field: 'birthDate' });
    expect(revealed.json()).toEqual({ value: '2000-02-01', expiresIn: 60 });
    expect(await db.auditLog.count({ where: { entityId: row.id, action: 'reveal' } })).toBe(1);
  });
  it('rejects stale writes and increments versions', async () => {
    const row = await club();
    expect((await request('PATCH', `/api/records/Club/${row.id}`, { version: 1, changes: { city: 'Örnek Şehir' } })).json().version).toBe(2);
    expect((await request('PATCH', `/api/records/Club/${row.id}`, { version: 1, changes: { city: 'Örnek Başka' } })).statusCode).toBe(409);
    expect((await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 })).statusCode).toBe(409);
  });
  it('soft deletes, restores and purges only from Trash', async () => {
    const row = await club(); await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    expect((await request('GET', '/api/clubs')).json().total).toBe(0);
    expect((await request('GET', `/api/records/Club/${row.id}`)).statusCode).toBe(404);
    let item = (await request('GET', '/api/trash')).json()[0];
    expect((await request('POST', `/api/trash/${item.id}/restore`, { version: item.version, recordVersion: item.recordVersion })).statusCode).toBe(200);
    expect((await request('GET', '/api/clubs')).json().total).toBe(1);
    await request('DELETE', `/api/records/Club/${row.id}`, { version: 3 });
    item = (await request('GET', '/api/trash')).json()[0];
    const preview = (await request('GET', `/api/trash/${item.id}/preview`)).json();
    expect((await request('DELETE', `/api/trash/${item.id}`, { version: item.version, recordVersion: item.recordVersion, previewToken: preview.previewToken })).statusCode).toBe(200);
    expect(await db.club.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await db.timelineEvent.count({ where: { entityId: row.id, action: 'purge' } })).toBe(1);
  });
  it('reads relations from both ends and rejects orphan references', async () => {
    const a = await club('Örnek Bir'); const b = await club('Örnek İki');
    expect((await request('POST', '/api/relations', { fromType: 'Club', fromId: a.id, toType: 'Club', toId: b.id, relation: 'partnerOf' })).statusCode).toBe(201);
    expect((await request('GET', `/api/records/Club/${a.id}/links`)).json()[0].direction).toBe('outgoing');
    expect((await request('GET', `/api/records/Club/${b.id}/links`)).json()[0].direction).toBe('incoming');
    expect((await request('POST', '/api/relations', { fromType: 'Club', fromId: a.id, toType: 'Club', toId: exampleId('missing'), relation: 'partnerOf' })).statusCode).toBe(404);
  });
  it('stores language and theme on the server', async () => {
    const settings = (await request('GET', '/api/settings')).json();
    expect(settings.language).toBe('tr'); expect(settings.theme).toBe('dark');
    expect((await request('PATCH', '/api/settings', { version: settings.version, language: 'en', theme: 'light' })).statusCode).toBe(200);
    expect((await request('GET', '/api/settings')).json().theme).toBe('light');
  });
  it('rotates persisted fields in batches without exposing plaintext', async () => {
    const created = await request('POST', '/api/players', { name: 'Örnek Anahtar Testi', primaryPosition: 'CM', birthDate: '2000-02-01' });
    const oldRing = keyring(); const nextKey = randomBytes(32).toString('base64');
    const rotation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/keys-rotate.ts'], { encoding: 'utf8', env: { ...process.env, FIELD_ENCRYPTION_KEY_ID: 'rotated', FIELD_ENCRYPTION_KEY: nextKey, FIELD_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify(oldRing.keys), BLIND_INDEX_KEY: oldRing.blind } });
    expect(rotation.status, rotation.stderr).toBe(0);
    const row = await db.player.findUniqueOrThrow({ where: { id: created.json().id } });
    expect(row.birthDate).toContain('v1.rotated.'); expect(row.version).toBe(2);
    expect(decrypt(row.birthDate!, 'Player.birthDate', { ...oldRing, active: 'rotated', keys: { ...oldRing.keys, rotated: nextKey } })).toBe('2000-02-01');
    expect(rotation.stdout).not.toContain('2000-02-01');
  });
});

describe('example seed and suggestion transaction', () => {
  it('is repeatable, labeled and encrypted', async () => {
    await seedExamples(db); await seedExamples(db);
    expect(await db.club.count()).toBe(3); expect(await db.player.count()).toBe(4); expect(await db.suggestion.count()).toBe(1);
    expect((await db.player.findMany()).every(p => p.isExample && p.name.startsWith('Örnek'))).toBe(true);
    expect((await db.guardian.findFirstOrThrow()).phone).not.toContain('+9000');
    expect((await db.medicalRecord.findFirstOrThrow()).summary).not.toContain('kontrol');
  });
  it('writes all four timelines and relations in one batch (R3)', async () => {
    await seedExamples(db);
    const res = await request('POST', '/api/suggestions', { requestId: exampleId('request'), playerId: exampleId('player-1'), personId: exampleId('person-0-1'), whyGoodTransfer: 'Örnek uyum' });
    expect(res.statusCode).toBe(201); expect(res.json().matchScore).toBeNull();
    expect(await db.timelineEvent.count({ where: { batchId: res.json().batchId } })).toBe(4);
    expect(await db.presentation.count({ where: { playerId: exampleId('player-1'), result: 'PENDING' } })).toBe(1);
    expect((await db.request.findUniqueOrThrow({ where: { id: exampleId('request') } })).status).toBe('SUGGESTED');
  });
  it('rolls back every row when a later insert fails', async () => {
    await seedExamples(db); const count = await db.suggestion.count(); const timelines = await db.timelineEvent.count();
    // A database trigger fails after Suggestion and Relation have been inserted.
    await db.$executeRawUnsafe(`CREATE FUNCTION fail_presentation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional rollback test'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_presentation BEFORE INSERT ON "Presentation" FOR EACH ROW EXECUTE FUNCTION fail_presentation_test()`);
    try {
      const res = await request('POST', '/api/suggestions', { requestId: exampleId('request'), playerId: exampleId('player-1'), personId: exampleId('person-0-1'), whyGoodTransfer: 'Örnek test' });
      expect(res.statusCode).toBe(500); expect(await db.suggestion.count()).toBe(count); expect(await db.timelineEvent.count()).toBe(timelines);
      expect(await db.relation.count({ where: { fromId: exampleId('player-1'), relation: 'suggestedTo' } })).toBe(0);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER fail_presentation ON "Presentation"'); await db.$executeRawUnsafe('DROP FUNCTION fail_presentation_test()'); }
  });
  it('blocks verification without a source and never applies an unsupported proposal', async () => {
    await seedExamples(db);
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { version: 1, action: 'approve' })).statusCode).toBe(400);
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { version: 1, action: 'approve', sourceUrl: 'https://example.com/source' })).statusCode).toBe(400);
  });
});

describe('foundation acceptance gaps', () => {
  it('does not allow an edited request to reference a person outside its club', async () => {
    await seedExamples(db);
    expect((await request('PATCH', `/api/records/Request/${exampleId('request')}`, { version: 2, changes: { clubId: exampleId('club-1') } })).statusCode).toBe(400);
    expect((await db.request.findUniqueOrThrow({ where: { id: exampleId('request') } })).clubId).toBe(exampleId('club-0'));
  });
  it('keeps field evidence, resets changed manual fields and preserves unrelated values', async () => {
    const source = { sourceUrl: 'https://example.com/official', sourceType: 'OFFICIAL', retrievedAt: '2026-11-02T00:00:00Z', verificationStatus: 'VERIFIED' };
    const created = await request('POST', '/api/clubs', { name: 'Örnek Kaynak', city: 'Örnek Şehir', isTracked: true, fieldProvenance: { city: source } });
    expect(created.statusCode).toBe(201); const row = created.json();
    expect(row.fieldProvenance.city).toEqual(source); expect(row.fieldProvenance.name.sourceType).toBe('MANUAL');
    const edited = await request('PATCH', `/api/records/Club/${row.id}`, { version: 1, changes: { city: 'Örnek Yeni Şehir' } });
    expect(edited.statusCode).toBe(200); expect(edited.json().isTracked).toBe(true);
    expect(edited.json().fieldProvenance.city.verificationStatus).toBe('UNVERIFIED'); expect(edited.json().fieldProvenance.name).toEqual(row.fieldProvenance.name);
    expect((await request('POST', '/api/clubs', { name: 'Örnek', fieldProvenance: { city: source } })).statusCode).toBe(400);
    expect((await request('POST', '/api/clubs', { name: 'Örnek', fieldProvenance: { name: { ...source, sourceUrl: null } } })).statusCode).toBe(400);
    expect((await request('POST', '/api/clubs', { name: 'Örnek', fieldProvenance: { name: { ...source, sourceUrl: 'javascript:alert(1)' } } })).statusCode).toBe(400);
  });
  it('rejects stale trash and underlying-record versions', async () => {
    const row = await club(); await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    const item = (await request('GET', '/api/trash')).json()[0];
    expect((await request('POST', `/api/trash/${item.id}/restore`, { version: 99, recordVersion: item.recordVersion })).statusCode).toBe(409);
    await db.club.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
    expect((await request('POST', `/api/trash/${item.id}/restore`, { version: item.version, recordVersion: item.recordVersion })).statusCode).toBe(409);
    expect((await request('GET', '/api/clubs')).json().total).toBe(0);
  });
  it('previews linked records and blocks purging a parent with a player', async () => {
    const row = await club(); await request('POST', '/api/players', { name: 'Örnek Bağlı Oyuncu', primaryPosition: 'CM', currentClubId: row.id });
    const preview = (await request('GET', `/api/records/Club/${row.id}/delete-preview`)).json();
    expect(preview.counts).toMatchObject({ Club: 1, Player: 1 }); expect(preview.canPurge).toBe(false);
    await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    const item = (await request('GET', '/api/trash')).json()[0]; const plan = (await request('GET', `/api/trash/${item.id}/preview`)).json();
    expect((await request('DELETE', `/api/trash/${item.id}`, { version: item.version, recordVersion: item.recordVersion, previewToken: plan.previewToken })).statusCode).toBe(409);
    expect(await db.player.count()).toBe(1);
  });
  it('requires a fresh purge preview after a linked item changes', async () => {
    const row = await club(); await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    const item = (await request('GET', '/api/trash')).json()[0]; const plan = (await request('GET', `/api/trash/${item.id}/preview`)).json();
    await db.note.create({ data: { entityType: 'Club', entityId: row.id, text: 'Örnek not' } });
    expect((await request('DELETE', `/api/trash/${item.id}`, { version: item.version, recordVersion: item.recordVersion, previewToken: plan.previewToken })).statusCode).toBe(409);
    expect(await db.club.count()).toBe(1);
  });
  it('applies retention only to previewed deleted records and never through daily jobs', async () => {
    const settings = (await request('GET', '/api/settings')).json();
    expect((await request('PATCH', '/api/settings', { version: settings.version, retentionDays: { Club: 2 } })).statusCode).toBe(200);
    expect((await request('PATCH', '/api/settings', { version: settings.version, retentionDays: { Club: 3 } })).statusCode).toBe(409);
    const row = await club(); await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    const item = await db.trashEntry.findFirstOrThrow();
    expect(item.expiresAt.getTime() - item.createdAt.getTime()).toBeCloseTo(2 * 86400_000, -3);
    await db.club.update({ where: { id: row.id }, data: { deletedAt: new Date(Date.now() - 3 * 86400_000) } });
    await db.trashEntry.update({ where: { id: item.id }, data: { expiresAt: new Date(Date.now() - 86400_000) } });
    expect((await dailyJobs()).trash).toEqual({ purged: 0, blocked: 0 });
    expect(await db.club.count({ where: { id: row.id } })).toBe(1);
    const plan = (await request('POST', '/api/admin/retention/preview', { table: 'Club' })).json();
    expect(plan.records).toContainEqual({ type: 'Club', id: row.id, version: 2 });
    const input = { table: 'Club', asOf: plan.asOf, previewToken: plan.previewToken };
    expect((await request('POST', '/api/admin/retention/purge', input)).statusCode).toBe(200);
    expect((await request('POST', '/api/admin/retention/purge', input)).statusCode).toBe(409);
    expect(await db.club.count()).toBe(0); expect(await db.auditLog.count({ where: { action: 'purge' } })).toBe(1);
  });
  it('covers every table and defaults to indefinite retention outside security expiry', async () => {
    const catalog = (await request('GET', '/api/admin/retention')).json();
    expect(catalog.tables.map((row: { type: string }) => row.type).sort()).toEqual(Prisma.dmmf.datamodel.models.map(model => model.name).sort());
    expect(catalog.periods).toEqual({}); expect(catalog.automaticBusinessDeletion).toBe(false);
    for (const retentionDays of [{ Unknown: 1 }, { Session: 1 }, { Club: 0 }]) expect((await request('PATCH', '/api/settings', { version: catalog.version, retentionDays })).statusCode).toBe(400);
    expect((await request('PATCH', '/api/settings', { version: catalog.version, retentionDays: { WorkLog: 14, MedicalRecord: 365 } })).statusCode).toBe(200);
    const row = await db.workLog.create({ data: { name: 'Örnek silinmiş çalışma', date: new Date('2020-01-01'), summary: 'Örnek not', category: 'Örnek kategori', durationMin: 15, status: 'DONE', deletedAt: new Date('2020-01-01') } });
    let plan = (await request('POST', '/api/admin/retention/preview', { table: 'WorkLog' })).json();
    expect(plan.records).toContainEqual({ type: 'WorkLog', id: row.id, version: 1 });
    const state = (await request('GET', '/api/settings')).json();
    expect((await request('PATCH', '/api/settings', { version: state.version, retentionDays: {} })).statusCode).toBe(200);
    expect((await request('POST', '/api/admin/retention/purge', { table: 'WorkLog', asOf: plan.asOf, previewToken: plan.previewToken })).statusCode).toBe(409);
    plan = (await request('POST', '/api/admin/retention/preview', { table: 'WorkLog' })).json(); expect(plan.total).toBe(0);
    expect(await db.workLog.count()).toBe(1);
  });
  it('rejects stale retention previews and blocks active dependent business records', async () => {
    const state = (await request('GET', '/api/settings')).json(); await request('PATCH', '/api/settings', { version: state.version, retentionDays: { Club: 1 } });
    const row = await club(); await request('DELETE', `/api/records/Club/${row.id}`, { version: 1 });
    await db.club.update({ where: { id: row.id }, data: { deletedAt: new Date('2020-01-01') } });
    let plan = (await request('POST', '/api/admin/retention/preview', { table: 'Club' })).json();
    await db.note.create({ data: { entityType: 'Club', entityId: row.id, text: 'Örnek yeni bağlantı' } });
    expect((await request('POST', '/api/admin/retention/purge', { table: 'Club', asOf: plan.asOf, previewToken: plan.previewToken })).statusCode).toBe(409);
    await db.player.create({ data: { name: 'Örnek Korunacak Oyuncu', searchName: 'ornek korunacak oyuncu', primaryPosition: 'CM', currentClubId: row.id } });
    plan = (await request('POST', '/api/admin/retention/preview', { table: 'Club' })).json(); expect(plan.canPurge).toBe(false);
    expect((await request('POST', '/api/admin/retention/purge', { table: 'Club', asOf: plan.asOf, previewToken: plan.previewToken })).statusCode).toBe(409);
    expect(await db.club.count()).toBe(1); expect(await db.player.count()).toBe(1); expect(await db.note.count()).toBe(1);
  });
  it('exposes only field-view metadata even if a historical log has extra sensitive properties', async () => {
    const value = 'contact@example.com';
    await db.auditLog.create({ data: { actor: 'owner', action: 'reveal', entityType: 'Person', entityId: exampleId('view'), diffs: { field: 'email', value, arbitrary: 'sensitive extra' } } });
    const result = (await request('GET', '/api/admin/access-log')).json();
    expect(result.items[0]).toMatchObject({ field: 'email', actor: 'owner', entityType: 'Person' });
    expect(JSON.stringify(result)).not.toContain(value); expect(JSON.stringify(result)).not.toContain('sensitive extra');
    expect(Object.keys(result.items[0]).sort()).toEqual(['id', 'actor', 'entityType', 'entityId', 'field', 'occurredAt'].sort());
  });
  it('removes examples and unflagged dependents while preserving unrelated records (R11)', async () => {
    await seedExamples(db); const saved = await club('Örnek Korunacak Kayıt');
    const person = await db.person.create({ data: { name: 'Örnek Bağımsız Kişi', searchName: 'ornek bagimsiz kisi' } });
    await db.relation.create({ data: { fromType: 'Person', fromId: person.id, toType: 'Club', toId: exampleId('club-0'), relation: 'contactOf' } });
    await db.medicalAccessLog.create({ data: { recordId: exampleId('medical'), actor: 'owner', action: 'VIEW' } });
    const plan = (await request('GET', '/api/admin/examples/preview')).json();
    expect(plan.counts.MedicalAccessLog).toBe(1); expect(plan.counts.PaymentSchedule).toBe(3);
    const result = await request('POST', '/api/admin/examples/cleanup', { previewToken: plan.previewToken });
    expect(result.statusCode, result.body).toBe(200); expect(result.json().counts).toEqual(plan.counts);
    for (const model of Prisma.dmmf.datamodel.models.filter(model => model.fields.some(field => field.name === 'isExample'))) {
      const count = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "${model.name}" WHERE "isExample" = true`);
      expect(Number(count[0].count), model.name).toBe(0);
    }
    expect(await db.club.findUnique({ where: { id: saved.id } })).not.toBeNull(); expect(await db.person.findUnique({ where: { id: person.id } })).not.toBeNull();
    expect(await db.relation.count()).toBe(0); expect(await db.medicalAccessLog.count()).toBe(0);
    expect(await db.auditLog.count({ where: { entityType: 'Owner', action: 'purge' } })).toBe(1);
  });
  it('rejects stale cleanup previews without deleting anything', async () => {
    await seedExamples(db); const plan = (await request('GET', '/api/admin/examples/preview')).json();
    await db.player.update({ where: { id: exampleId('player-0') }, data: { version: { increment: 1 } } });
    expect((await request('POST', '/api/admin/examples/cleanup', { previewToken: plan.previewToken })).statusCode).toBe(409);
    expect(await db.player.count()).toBe(4);
  });
  it('version-checks proposal reviews and leaves stale proposals untouched', async () => {
    await seedExamples(db);
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { version: 2, action: 'reject', reason: 'Örnek gerekçe' })).statusCode).toBe(409);
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { version: 1, action: 'reject', reason: 'Örnek gerekçe' })).json().version).toBe(2);
    expect(await db.timelineEvent.count({ where: { entityId: exampleId('club-0'), action: 'reject' } })).toBe(1);
  });
  it('documents all registered API operations and validates empty-route inputs', async () => {
    const document = openapiDocument();
    for (const route of apiContracts.filter(route => !route.testOnly)) {
      expect(app.hasRoute({ method: route.method.toUpperCase() as 'GET', url: route.path }), route.path).toBe(true);
      expect(document.paths[route.path.replace(/:(\w+)/g, '{$1}')], route.path).toHaveProperty(route.method);
    }
    expect(document.paths).not.toHaveProperty('/auth/test');
    expect((await request('GET', '/api/settings?unexpected=true')).statusCode).toBe(400);
    expect((await request('POST', '/api/logout', { unexpected: true })).statusCode).toBe(400);
  });
});
