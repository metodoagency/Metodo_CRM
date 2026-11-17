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
import sharp from 'sharp';
import { ageOn, istanbulToday } from '../shared/domain.js';
import { readBirthdayCalendar, refreshBirthdayReminders } from '../server/birthdays.js';

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
describe('sensitive paths: birthday calendar', () => {
  it('shows only live owner birthdays and audits calendar access without birth dates', async () => {
    const now = new Date('2026-12-29T21:00:00Z');
    const birthDate = '1996-12-31';
    const person = await db.person.create({ data: { name: 'Örnek Takvim Kişisi', searchName: 'ornek takvim', birthDate: encrypt(birthDate, 'Person.birthDate') } });
    const player = await db.player.create({ data: { name: 'Örnek Takvim Oyuncusu', searchName: 'ornek oyuncu', primaryPosition: 'CM', birthDate: encrypt(birthDate, 'Player.birthDate') } });
    const agent = await db.agent.create({ data: { name: 'Örnek Takvim Menajeri', birthDate: encrypt(birthDate, 'Agent.birthDate'), countries: [], markets: [], networkMemberships: [] } });
    await db.person.create({ data: { name: 'Örnek Silinmiş Kişi', searchName: '', birthDate: encrypt(birthDate, 'Person.birthDate'), deletedAt: now } });
    const owner = await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    await db.person.create({ data: { ownerId: owner.id, name: 'Örnek Başka Sahip', searchName: '', birthDate: encrypt(birthDate, 'Person.birthDate') } });
    const list = await db.$transaction(tx => readBirthdayCalendar(tx, 'month', 1, now));
    expect(list).toMatchObject({ total: 3, today: '2026-12-30', expiresIn: 60 });
    expect(list.items.map(row => row.id).sort()).toEqual([agent.id, person.id, player.id].sort());
    expect(list.items.every(row => row.date === '2026-12-31' && row.days === 1)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(birthDate);
    const access = await db.auditLog.findMany({ where: { action: 'reveal' } });
    expect(access).toHaveLength(3);
    expect(access.every(row => JSON.stringify(row.diffs) === '{"field":"birthDate"}')).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/calendar/birthdays', headers: { origin }, payload: { view: 'month' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/calendar/birthdays', headers: { cookie, origin }, payload: { view: 'month' } })).statusCode).toBe(403);
    expect((await request('POST', '/api/calendar/birthdays', { view: 'month', ownerId: 'other' })).statusCode).toBe(400);
  });

  it('catches up due thresholds at the Istanbul date boundary and retrying concurrently keeps one per occurrence', async () => {
    const birthday = '1995-01-01';
    const person = await db.person.create({ data: { name: 'Örnek Yıl Dönümü', searchName: 'ornek yil donumu', birthDate: encrypt(birthday, 'Person.birthDate') } });
    const before = new Date('2026-12-31T20:59:59Z');
    const after = new Date('2026-12-31T21:00:00Z');
    const created = await Promise.all([refreshBirthdayReminders(db, before), refreshBirthdayReminders(db, before)]);
    expect(created.reduce((total, count) => total + count)).toBe(2);
    const reminder = await db.$transaction(tx => readBirthdayCalendar(tx, 'reminders', 1, before));
    expect(reminder.items).toMatchObject([{ id: person.id, date: '2027-01-01', days: 1, thresholds: [30, 7] }]);
    expect(await refreshBirthdayReminders(db, after)).toBe(1);
    expect(await refreshBirthdayReminders(db, after)).toBe(0);
    expect((await db.notification.findMany({ where: { type: 'BIRTHDAY' }, orderBy: { thresholdDays: 'asc' } })).map(row => [row.thresholdDays, row.targetDate.toISOString().slice(0, 10)])).toEqual([[0, '2027-01-01'], [7, '2027-01-01'], [30, '2027-01-01']]);
    await db.person.update({ where: { id: person.id }, data: { deletedAt: after } });
    expect((await db.$transaction(tx => readBirthdayCalendar(tx, 'reminders', 1, after))).items).toEqual([]);
    expect(await db.notification.count({ where: { entityId: person.id } })).toBe(3);
  });

  it('handles leap days and disables or changes configured thresholds without deleting the history', async () => {
    await db.person.create({ data: { name: 'Örnek 29 Şubat', searchName: '', birthDate: encrypt('2000-02-29', 'Person.birthDate') } });
    const now = new Date('2027-02-28T21:00:00Z');
    const settings = (await request('GET', '/api/settings')).json();
    expect(settings.birthdayThresholds).toEqual([30, 7, 0]);
    expect((await request('PATCH', '/api/settings', { version: settings.version, birthdayThresholds: [7, 7] })).statusCode).toBe(400);
    expect((await request('PATCH', '/api/settings', { version: settings.version, birthdayThresholds: [2, 0] })).statusCode).toBe(200);
    expect(await refreshBirthdayReminders(db, now)).toBe(2);
    expect((await db.$transaction(tx => readBirthdayCalendar(tx, 'reminders', 1, now))).items).toMatchObject([{ date: '2027-03-01', days: 0, thresholds: [2, 0] }]);
    expect((await db.$transaction(tx => readBirthdayCalendar(tx, 'month', 1, new Date('2028-02-29T00:00:00Z')))).items).toMatchObject([{ date: '2028-02-29', days: 0 }]);
    expect((await request('PATCH', '/api/settings', { version: settings.version + 1, birthdayThresholds: [] })).statusCode).toBe(200);
    expect((await db.$transaction(tx => readBirthdayCalendar(tx, 'reminders', 1, now))).items).toEqual([]);
    expect(await db.notification.count()).toBe(2);
  });

  it('encrypts agent birthdays, keeps individual year hiding and preserves player age reveal', async () => {
    const agentDate = '1993-08-23';
    const created = await request('POST', '/api/calendar/agents', { name: 'Örnek Menajer Doğum Günü', birthDate: agentDate, hideBirthYear: true });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(agentDate);
    const agent = created.json();
    const record = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect(record.birthDate).not.toBe(agentDate);
    expect(decrypt(record.birthDate!, 'Agent.birthDate')).toBe(agentDate);
    const path = `/api/calendar/birthdays/Agent/${agent.id}`;
    expect((await request('POST', `${path}/view`)).json()).toEqual({ value: '08-23', expiresIn: 60 });
    expect((await request('PATCH', path, { version: agent.version, hideBirthYear: false })).statusCode).toBe(200);
    expect((await request('POST', `${path}/view`)).json().value).toBe(agentDate);
    expect((await request('PATCH', path, { version: agent.version, hideBirthYear: false, birthDate: null })).statusCode).toBe(409);
    expect((await request('GET', '/api/calendar/agents?q=DOGUM')).json()).toMatchObject({ total: 1 });
    const player = (await request('POST', '/api/players', { name: 'Örnek Yaşı Gizli Oyuncu', primaryPosition: 'CM', birthDate: agentDate })).json();
    expect((await request('PATCH', `/api/calendar/birthdays/Player/${player.id}`, { version: player.version, hideBirthYear: true })).statusCode).toBe(200);
    expect((await request('POST', `/api/records/Player/${player.id}/reveal`, { field: 'birthDate' })).json()).toMatchObject({ value: '08-23', format: 'monthDay' });
    expect((await request('POST', `/api/records/Player/${player.id}/age`)).json()).toMatchObject({ age: ageOn(agentDate), expiresIn: 60 });
    const log = await db.timelineEvent.findMany({ where: { entityId: { in: [agent.id, player.id] } } });
    expect(JSON.stringify(log)).not.toContain(agentDate);
  });

  it('keeps a versioned, privately revealed greeting per year and restores it from Trash', async () => {
    const person = (await request('POST', '/api/people', { name: 'Örnek Yıllık Tebrik', birthDate: '1990-05-01' })).json();
    const year = Number(istanbulToday().slice(0, 4));
    const path = `/api/calendar/greetings/Person/${person.id}/${year}`;
    const greetingNote = 'Örnek gizli tebrik notu';
    const saved = await request('PATCH', path, { version: null, greetingNote, sent: true });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ version: 1, sent: true });
    expect((await request('PATCH', path, { version: null, greetingNote, sent: false })).statusCode).toBe(409);
    expect((await request('POST', `${path}/view`)).json()).toEqual({ version: 1, greetingNote, sent: true, expiresIn: 60 });
    expect((await request('POST', `/api/calendar/greetings/Person/${person.id}/${year - 1}/view`)).json()).toMatchObject({ version: null, greetingNote: '', sent: false });
    const [stored] = await db.birthdayGreeting.findMany();
    expect(stored.greetingNote).not.toBe(greetingNote);
    expect(decrypt(stored.greetingNote!, 'BirthdayGreeting.greetingNote')).toBe(greetingNote);
    expect(JSON.stringify(await db.auditLog.findMany({ where: { entityType: 'BirthdayGreeting' } }))).not.toContain(greetingNote);
    expect((await request('GET', '/api/admin/access-log')).json().items).toContainEqual(expect.objectContaining({ field: 'greetingNote', entityType: 'BirthdayGreeting', entityId: stored.id }));
    expect((await request('DELETE', path, { version: 1 })).statusCode).toBe(200);
    expect((await request('POST', `${path}/view`)).statusCode).toBe(409);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: stored.id } });
    expect((await request('GET', `/api/trash/${trash.id}/preview`)).statusCode).toBe(200);
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 2 })).statusCode).toBe(200);
    expect((await request('POST', `${path}/view`)).json()).toMatchObject({ version: 3, greetingNote, sent: true });
  });

  it('validates and restores manually recorded significant dates with optimistic versions', async () => {
    expect((await request('POST', '/api/calendar/dates', { name: 'Örnek Önemli Tarih', date: '2026-02-30' })).statusCode).toBe(400);
    const added = await request('POST', '/api/calendar/dates', { name: 'Örnek Önemli Tarih', date: '2027-01-18' });
    expect(added.statusCode).toBe(201);
    const row = added.json();
    const path = `/api/calendar/dates/${row.id}`;
    expect((await request('PATCH', path, { version: row.version, name: 'Örnek Yıldönümü', date: '2027-01-19' })).statusCode).toBe(200);
    expect((await request('DELETE', path, { version: row.version })).statusCode).toBe(409);
    expect((await request('DELETE', path, { version: row.version + 1 })).statusCode).toBe(200);
    expect((await request('GET', '/api/calendar/dates')).json().items).toEqual([]);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    expect((await request('GET', `/api/trash/${trash.id}/preview`)).json()).toMatchObject({ canPurge: true });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: row.version + 2 })).statusCode).toBe(200);
    expect((await request('GET', '/api/calendar/dates')).json()).toMatchObject({ items: [{ name: 'Örnek Yıldönümü', date: '2027-01-19T00:00:00.000Z' }], total: 1 });
  });

  it('includes example greetings and reminders in the same previewed cleanup as their parent', async () => {
    const today = istanbulToday();
    const year = Number(today.slice(0, 4));
    const parent = await db.person.create({ data: { name: 'Örnek Temizlik Doğum Günü', searchName: '', isExample: true, birthDate: encrypt(`1996-${today.slice(5)}`, 'Person.birthDate') } });
    const path = `/api/calendar/greetings/Person/${parent.id}/${year}`;
    expect((await request('PATCH', path, { version: null, greetingNote: 'Örnek Temizlik Notu', sent: false })).statusCode).toBe(200);
    expect((await dailyJobs()).birthdayReminders).toBe(3);
    const preview = (await request('GET', '/api/admin/examples/preview')).json();
    expect(preview.counts).toMatchObject({ Person: 1, BirthdayGreeting: 1, Notification: 3 });
    expect((await request('POST', '/api/admin/examples/cleanup', { previewToken: preview.previewToken })).statusCode).toBe(200);
    expect(await db.birthdayGreeting.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
  });
});

describe('sensitive paths: people and club network', () => {
  it('projects explicit, stable CSV columns without free text or private evidence', async () => {
    const typePaths = ['/api/export/Club', '/api/export/Person', '/api/export/Request'] as const;
    const headers = await Promise.all(typePaths.map(async path => (await request('GET', path)).body.split('\r\n')[0]));
    const privateNote = 'Örnek gizli not 15550000000';
    const privateEmail = 'calendar-private@example.com';
    const privateBirth = '1996-11-16';
    const parent = await db.club.create({ data: { name: '  =Örnek Kulüp', searchName: 'ornek kulup', notes: privateNote, fieldProvenance: { notes: { sourceUrl: `https://example.com/?email=${privateEmail}` } } } });
    await db.person.create({ data: { name: 'Örnek Kişi', searchName: 'ornek kisi', notes: privateNote, email: encrypt(privateEmail, 'Person.email'), birthDate: encrypt(privateBirth, 'Person.birthDate'), tffProfileUrl: `https://example.com/?email=${privateEmail}` } });
    await db.request.create({ data: { name: 'Örnek Talep', clubId: parent.id, position: 'CM', profileText: privateNote, salaryMax: '12345.12', sourceUrl: `https://example.com/?email=${privateEmail}` } });
    for (const [index, path] of typePaths.entries()) {
      const csv = await request('GET', path);
      expect(csv.statusCode).toBe(200);
      expect(csv.body.split('\r\n')[0]).toBe(headers[index]);
      expect(csv.body).not.toMatch(/gizli not|private@example|1996-11-16|fieldProvenance|birthDate|phoneIndex|emailIndex|notes|example\.com|profileText|salaryMax|12345\.12/);
    }
    expect((await request('GET', typePaths[0])).body).toContain(`"'  =Örnek Kulüp"`);
    expect((await request('GET', typePaths[1])).body).toContain('Örnek Kişi');
    expect((await request('GET', typePaths[2])).body).toContain('Örnek Talep');
    const logs = await db.auditLog.findMany({ where: { action: 'export' } });
    expect(logs).toHaveLength(9);
    expect(logs.map(row => row.diffs)).toContainEqual({ table: 'Request', count: 1, sensitive: false });
    expect(JSON.stringify(logs)).not.toContain(privateNote);
  });

  it('keeps dates encrypted, supports day-month view and clears the corresponding blind index', async () => {
    const birthDate = '2000-02-29';
    const payload = { name: 'Örnek Kişi Profili', role: 'MEDIA', birthDate, hideBirthYear: true, transfermarktUrl: 'https://example.com/profile' };
    const created = await request('POST', '/api/people', payload);
    expect(created.statusCode, created.body).toBe(201);
    const { id, version } = created.json();
    expect(created.json()).toMatchObject({ birthDate: '***', role: 'MEDIA', hideBirthYear: true });
    const stored = await db.person.findUniqueOrThrow({ where: { id } });
    expect(stored.birthDate).not.toBe(birthDate);
    expect(decrypt(stored.birthDate!, 'Person.birthDate')).toBe(birthDate);
    expect(stored.birthDateIndex).not.toBeNull();
    const path = `/api/records/Person/${id}`;
    const age = `${path}/age`;
    expect((await request('GET', '/api/people?q=Kişi')).json().items).toEqual([expect.objectContaining({ id, birthDate: '***' })]);
    expect((await request('GET', '/api/export/Person')).body).not.toContain(birthDate);
    expect((await app.inject({ method: 'POST', url: age, headers: { origin, cookie } })).statusCode).toBe(403);
    const revealed = await request('POST', age);
    expect(revealed.statusCode, revealed.body).toBe(200);
    expect(revealed.json()).toEqual({ age: ageOn(birthDate), minor: false, expiresIn: 60 });
    expect((await request('POST', `${path}/reveal`, { field: 'birthDate' })).json()).toEqual({ value: '02-29', format: 'monthDay', expiresIn: 60 });
    expect((await request('PATCH', path, { version, changes: { tffProfileUrl: 'https://user:password@example.com' } })).statusCode).toBe(400);
    expect((await request('PATCH', path, { version: version + 1, changes: { birthDate: null } })).statusCode).toBe(409);
    expect((await request('PATCH', path, { version, changes: { birthDate: null } })).statusCode).toBe(200);
    expect((await db.person.findUniqueOrThrow({ where: { id } })).birthDateIndex).toBeNull();
    expect((await request('POST', age)).json()).toEqual({ age: null, minor: null, expiresIn: 60 });
    expect(JSON.stringify(await db.auditLog.findMany({ where: { entityId: id } }))).not.toContain(birthDate);
  });

  it('computes club overlap from dated live memberships and treats departure dates as exclusive', async () => {
    const person = async (name: string) => (await request('POST', '/api/people', { name, role: 'HEAD_COACH' })).json();
    const current = await person('Örnek Kişi Ağ');
    const peer = await person('Örnek Önceki Yardımcı');
    const successor = await person('Örnek Devir Alan');
    const unknown = await person('Örnek Tarihsiz');
    const hidden = await person('Örnek Silinen');
    const first = await club('Örnek Birinci Kulüp');
    const second = await club('Örnek İkinci Kulüp');
    const create = (id: string, c: string, startDate: string | null, endDate: string | null, role = 'HEAD_COACH') => request('POST', `/api/people/${id}/tenures`, { clubId: c, role, startDate, endDate, sourceUrl: 'https://example.com/staff' });
    const initial = await create(current.id, first.id, '2024-01-01', '2024-06-01');
    expect(initial.statusCode, initial.body).toBe(201);
    const tenure = initial.json();
    expect((await create(current.id, first.id, '2024-01-01', '2024-06-01')).statusCode).toBe(409);
    expect((await create(current.id, second.id, '2024-04-01', '2024-06-15', 'SCOUT')).statusCode).toBe(201);
    expect((await create(peer.id, first.id, '2024-05-01', '2024-06-01', 'ASSISTANT')).statusCode).toBe(201);
    expect((await create(successor.id, first.id, '2024-06-01', null)).statusCode).toBe(201);
    expect((await create(unknown.id, first.id, null, null)).statusCode).toBe(201);
    expect((await create(hidden.id, first.id, '2024-01-01', null)).statusCode).toBe(201);
    await db.person.update({ where: { id: hidden.id }, data: { deletedAt: new Date() } });
    const endpoint = `/api/people/${current.id}/network`;
    const overlap = await request('GET', `${endpoint}?section=workedTogether`);
    expect(overlap.statusCode, overlap.body).toBe(200);
    expect(overlap.json().items).toEqual([expect.objectContaining({ personId: peer.id, clubId: first.id, startDate: '2024-05-01', lastDay: '2024-05-31' })]);
    const conflicts = await request('GET', `${endpoint}?section=overlaps`);
    expect(conflicts.statusCode, conflicts.body).toBe(200);
    expect(conflicts.json().items).toEqual([expect.objectContaining({ startDate: '2024-04-01', lastDay: '2024-05-31' })]);
    const own = await request('GET', endpoint);
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().items).toHaveLength(2);
    const update = { version: tenure.version, startDate: '2024-01-01', endDate: '2024-07-01', role: 'HEAD_COACH', sourceUrl: null };
    expect((await request('PATCH', `/api/people/${successor.id}/tenures/${tenure.id}`, update)).statusCode).toBe(404);
    const saved = await request('PATCH', `/api/people/${current.id}/tenures/${tenure.id}`, update);
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await request('PATCH', `/api/people/${current.id}/tenures/${tenure.id}`, update)).statusCode).toBe(409);
    const events = await db.timelineEvent.findMany({ where: { action: 'person_tenure_updated' }, select: { entityId: true, batchId: true } });
    expect(events.map(event => event.entityId).sort()).toEqual([current.id, first.id].sort());
    expect(new Set(events.map(event => event.batchId)).size).toBe(1);
    await db.club.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    expect((await request('GET', `${endpoint}?section=workedTogether`)).json().items).toEqual([]);
  });
});

function uploadFile(id: string, data = pdfFile, mime = 'application/pdf', extra = '', type: 'Club' | 'Player' | 'Suggestion' = 'Club') {
  const boundary = 'example-boundary';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Örnek belge.pdf"\r\nContent-Type: ${mime}\r\n\r\n`), data, Buffer.from(`\r\n${extra}--${boundary}--\r\n`)]);
  return app.inject({ method: 'POST', url: `/api/records/${type}/${id}/files`, payload, headers: { cookie, origin, 'x-csrf-token': csrf, 'content-type': `multipart/form-data; boundary=${boundary}` } });
}
describe('sensitive paths: player card evidence', () => {
  async function createPlayer(name: string, birthDate?: string) {
    const result = await request('POST', '/api/players', { name, primaryPosition: 'CM', birthDate });
    expect(result.statusCode, result.body).toBe(201);
    return result.json();
  }

  it('sanitizes legacy and new biographies, preserves formatting, and excludes biography content from audit diffs', async () => {
    const player = await createPlayer('Örnek biyografi');
    const recordUrl = `/api/records/Player/${player.id}`;
    const url = `/api/players/${player.id}/biography`;
    const legacy = 'Örnek eski biyografi\nİkinci satır';
    await db.player.update({ where: { id: player.id }, data: { bio: legacy } });
    expect((await request('GET', recordUrl)).json().bio).toBe('<p>Örnek eski biyografi<br />İkinci satır</p>');
    const unsafe = '<svg><script>exampleSvg()</script></svg><img src="https://example.com/blocked.png" onerror="exampleError()"><iframe srcdoc="<script>exampleFrame()</script>">hidden</iframe>'
      + '<a href="jav&#9;ascript:exampleBad()">Bad scheme</a><a href="//example.com">Relative</a><a href="https://name:secret@example.com">Credentials</a>';
    await db.player.update({ where: { id: player.id }, data: { bio: `<h2>Örnek eski başlık</h2>${unsafe}` } });
    const safeLegacy = (await request('GET', recordUrl)).json().bio;
    expect(safeLegacy).toContain('<h3>Örnek eski başlık</h3>');
    expect(safeLegacy).not.toMatch(/<svg|<script|<img|<iframe|exampleBad|name:secret|href=/i);
    const html = '<h3>Örnek başlık</h3><p><b>Örnek gizli biyografi metni</b> <i>Örnek vurgu</i></p><ul><li>Birinci</li></ul><ol><li>İkinci</li></ol>'
      + '<a href="https://example.com/evidence" target="popup" onclick="exampleClick()">Kaynak</a>' + unsafe;
    const payload = { version: player.version, html };
    expect((await app.inject({ method: 'PATCH', url, headers: { origin }, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url, headers: { origin, cookie }, payload })).statusCode).toBe(403);
    expect((await request('PATCH', url, { ...payload, html: 'a'.repeat(24_001) })).statusCode).toBe(400);
    const saved = await request('PATCH', url, payload);
    expect(saved.statusCode, saved.body).toBe(200);
    const updated = saved.json();
    expect(updated.bio).toContain('<strong>Örnek gizli biyografi metni</strong>');
    expect(updated.bio).toContain('<em>Örnek vurgu</em>');
    expect(updated.bio).toContain('<ul><li>Birinci</li></ul><ol><li>İkinci</li></ol>');
    expect(updated.bio).toContain('href="https://example.com/evidence" rel="noopener noreferrer" target="_blank"');
    expect(updated.bio).not.toMatch(/<svg|<script|<img|<iframe|exampleBad|name:secret|onclick/i);
    expect((await request('GET', recordUrl)).json().bio).toBe(updated.bio);
    expect((await request('PATCH', url, payload)).statusCode).toBe(409);
    expect((await request('PATCH', recordUrl, { version: updated.version, changes: { status: 'OWN' } })).statusCode).toBe(200);
    const logs = await db.auditLog.findMany({ where: { entityId: player.id }, select: { diffs: true } });
    const history = await request('GET', `${recordUrl}/timeline`);
    expect(JSON.stringify(logs) + history.body).not.toMatch(/gizli biyografi|exampleError|exampleSvg/);
    expect((await request('GET', '/api/export/Player')).body).not.toContain('gizli biyografi');
  });

  it('updates card metadata with a version and projects only owner-scoped printable fields', async () => {
    const player = await createPlayer('Örnek kart oyuncusu', '2000-02-01');
    const linked = await club('Örnek kart kulübü');
    const deleted = await club('Örnek silinen kulüp');
    await db.club.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await db.player.update({ where: { id: player.id }, data: { bio: 'Örnek gizli biyografi', notes: 'Örnek özel not', contractEndDate: new Date('2027-02-01'), marketValue: '9999999999999999.99', marketValueCurrency: 'EUR' } });
    const url = `/api/players/${player.id}/card`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await request('PATCH', url, { version: player.version, changes: { currentClubId: deleted.id } })).statusCode).toBe(404);
    expect((await request('PATCH', url, { version: player.version, changes: { secondaryPositions: ['CM'] } })).statusCode).toBe(400);
    expect((await request('PATCH', url, { version: player.version, changes: { contractEndDate: '2027-12-31' } })).statusCode).toBe(400);
    const changes = { nationalities: ['Örnek uyruk'], euPassport: false, heightCm: 183, weightKg: '73.45', secondaryPositions: ['DM'], preferredFoot: 'LEFT', currentClubId: linked.id };
    const saved = await request('PATCH', url, { version: player.version, changes, sourceUrl: 'https://example.com/profile' });
    expect(saved.statusCode, saved.body).toBe(200);
    const card = (await request('GET', url)).json();
    expect(card).toMatchObject({ name: player.name, nationalities: changes.nationalities, euPassport: false, heightCm: 183, weightKg: '73.45',
      secondaryPositions: ['DM'], preferredFoot: 'LEFT', currentClub: { id: linked.id, name: linked.name }, contractEndDate: '2027-02-01',
      marketValue: '9999999999999999.99', marketValueCurrency: 'EUR', hasBirthDate: true });
    expect(JSON.stringify(card)).not.toMatch(/birthDateIndex|storageKey|gizli biyografi|özel not|2000-02-01|example\.com\/profile/);
    expect((await request('GET', `/api/records/Player/${player.id}`)).json().fieldProvenance.heightCm.sourceUrl).toBe('https://example.com/profile');
    expect((await request('PATCH', url, { version: player.version, changes })).statusCode).toBe(409);
    const cleared = await request('PATCH', url, { version: saved.json().version, changes: { weightKg: null } });
    expect(cleared.statusCode).toBe(200);
    expect((await request('GET', url)).json().weightKg).toBeNull();
    expect((await request('PATCH', `/api/records/Player/${player.id}`, { version: cleared.json().version, changes: { primaryPosition: 'DM' } })).statusCode).toBe(200);
    expect((await request('GET', url)).json()).toMatchObject({ primaryPosition: 'DM', secondaryPositions: [] });
  });

  it('reveals only individually selected card fields with value-free logging and a version guard', async () => {
    const birthDate = '2000-02-01';
    const player = await createPlayer('Örnek süreli kart', birthDate);
    await db.player.update({ where: { id: player.id }, data: { levelScore: '9.5' } });
    const url = `/api/players/${player.id}/card/private`;
    const ageOnly = { version: player.version, includeAge: true, includeFit: false };
    expect((await app.inject({ method: 'POST', url, headers: { origin, cookie }, payload: ageOnly })).statusCode).toBe(403);
    expect((await request('POST', url, { ...ageOnly, version: player.version + 1 })).statusCode).toBe(409);
    expect((await request('POST', url, { ...ageOnly, includeAge: false })).statusCode).toBe(400);
    const age = await request('POST', url, ageOnly);
    expect(age.json()).toEqual({ age: ageOn(birthDate), expiresIn: 60 });
    const fit = await request('POST', url, { ...ageOnly, includeAge: false, includeFit: true });
    expect(fit.json()).toMatchObject({ fit: { status: 'SUITABLE', example: true }, expiresIn: 60 });
    expect(fit.json()).not.toHaveProperty('age');
    expect(fit.body).not.toMatch(/birthDate|referenceAge|scoreMeets|2000-02-01/);
    const views = await db.auditLog.findMany({ where: { entityId: player.id, action: 'reveal' }, select: { diffs: true } });
    expect(views.map(view => view.diffs)).toEqual([{ field: 'birthDate' }, { field: 'birthDate' }]);
  });

  it('evaluates versioned owner tiers on demand without disclosing age or birth date', async () => {
    const birthDate = '2000-02-01';
    const age = ageOn(birthDate);
    const player = await createPlayer('Örnek lig uygunluğu', birthDate);
    const url = `/api/players/${player.id}/suitability`;
    expect((await app.inject({ method: 'POST', url, headers: { origin } })).statusCode).toBe(401);
    expect((await request('POST', url)).json()).toMatchObject({ example: true, missing: ['score'], results: [] });
    await db.player.update({ where: { id: player.id }, data: { levelScore: '7.5' } });
    const settings = (await request('GET', '/api/settings')).json();
    const tiers = [
      { tier: 1, minScore: 8, referenceAge: age + 3, maxAgeDiff: 2 },
      { tier: 2, minScore: 7.5, referenceAge: age - 2, maxAgeDiff: 2 },
      { tier: 3, minScore: 8.5, referenceAge: age, maxAgeDiff: 0 },
    ];
    expect((await request('PATCH', '/api/settings', { version: settings.version, leagueTiers: [...tiers, tiers[0]] })).statusCode).toBe(400);
    expect((await request('PATCH', '/api/settings', { version: settings.version, leagueTiers: tiers })).statusCode).toBe(200);
    expect((await request('PATCH', '/api/settings', { version: settings.version, leagueTiers: tiers })).statusCode).toBe(409);
    const evaluated = await request('POST', url);
    expect(evaluated.statusCode, evaluated.body).toBe(200);
    expect(evaluated.json()).toMatchObject({ example: false, missing: [], expiresIn: 60,
      results: [{ tier: 1, status: 'CLOSE', scoreMeets: false, ageMeets: false }, { tier: 2, status: 'SUITABLE', scoreMeets: true, ageMeets: true },
        { tier: 3, status: 'UNSUITABLE', scoreMeets: false, ageMeets: true }] });
    expect(evaluated.body).not.toContain(birthDate);
    expect(evaluated.json()).not.toHaveProperty('age');
    const events = await db.auditLog.findMany({ where: { entityId: player.id, action: 'reveal' } });
    expect(events.map(event => event.diffs)).toEqual([{ field: 'birthDate' }]);
  });

  it('keeps exact market values, rejects stale and invalid evidence, and preserves current value on a backdated entry', async () => {
    const player = await createPlayer('Örnek değer geçmişi');
    const url = `/api/players/${player.id}/market`;
    const value = { version: player.version, amount: '9999999999999999.99', currency: 'EUR', date: '2026-01-12', sourceUrl: 'https://example.com/value', method: 'Örnek manuel değer' };
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await request('PATCH', url, { ...value, method: '' })).statusCode).toBe(400);
    expect((await request('PATCH', url, { ...value, date: '2099-01-12' })).statusCode).toBe(400);
    expect((await request('PATCH', url, { ...value, sourceUrl: 'https://owner:password@example.com' })).statusCode).toBe(400);
    expect((await request('PATCH', url, { ...value, profileUrl: 'javascript:alert(1)' })).statusCode).toBe(400);
    const current = await request('PATCH', url, { ...value, profileUrl: 'https://example.com/profile' });
    expect(current.statusCode, current.body).toBe(200);
    expect((await request('PATCH', url, value)).statusCode).toBe(409);
    const historic = { ...value, version: current.json().version, date: '2025-12-15', currency: 'USD', amount: '14500.5', method: 'Örnek önceki değer' };
    const earlier = await request('PATCH', url, historic);
    expect(earlier.statusCode, earlier.body).toBe(200);
    const history = (await request('GET', url)).json();
    expect(history).toMatchObject({ version: earlier.json().version, profileUrl: 'https://example.com/profile', more: false,
      current: { amount: value.amount, currency: value.currency, date: value.date, sourceUrl: value.sourceUrl },
      items: [{ amount: '14500.50', date: historic.date, currency: historic.currency, method: historic.method }, { amount: value.amount, date: value.date, method: value.method }],
    });
    expect(await db.timelineEvent.count({ where: { entityId: player.id, action: 'market_value' } })).toBe(2);
    expect((await request('GET', '/api/export/Player')).body).not.toContain(value.method);
  });

  it('serves only the owner player’s live normalized photo with rights evidence and logs a value-free view', async () => {
    const player = await createPlayer('Örnek fotoğraf');
    const other = await createPlayer('Örnek diğer oyuncu');
    const image = await sharp({ create: { width: 12, height: 16, channels: 3, background: '#bade90' } }).png().toBuffer();
    const uploaded = await uploadFile(player.id, image, 'image/png', '', 'Player');
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const photo = uploaded.json();
    const pdf = (await uploadFile(player.id, pdfFile, 'application/pdf', '', 'Player')).json();
    const url = `/api/players/${player.id}/photo`;
    const input = { action: 'set', version: player.version, attachmentId: photo.id, attachmentVersion: photo.version, sourceUrl: 'https://example.com/photo', rightsNote: 'Örnek kullanım izni' };
    expect((await request('GET', url)).statusCode).toBe(404);
    expect((await request('PATCH', url, { ...input, rightsNote: '' })).statusCode).toBe(400);
    expect((await request('PATCH', url, { ...input, attachmentVersion: photo.version + 1 })).statusCode).toBe(409);
    expect((await request('PATCH', url, { ...input, attachmentId: pdf.id, attachmentVersion: pdf.version })).statusCode).toBe(409);
    expect((await request('PATCH', `/api/players/${other.id}/photo`, { ...input, version: other.version })).statusCode).toBe(409);
    const selected = await request('PATCH', url, input);
    expect(selected.statusCode, selected.body).toBe(200);
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect((await request('GET', '/api/players')).json().items).toEqual(expect.arrayContaining([expect.objectContaining({ id: player.id, photo: true })]));
    const imageResponse = await request('GET', url);
    expect(imageResponse.statusCode, imageResponse.body).toBe(200);
    expect(imageResponse.headers).toMatchObject({ 'content-type': 'image/webp', 'cache-control': 'no-store', 'content-disposition': 'inline' });
    expect((await sharp(imageResponse.rawPayload).metadata()).format).toBe('webp');
    const events = await db.auditLog.findMany({ where: { entityId: photo.id, action: 'reveal' } });
    expect(events.map(event => event.diffs)).toEqual([{ field: 'document' }]);
    expect((await request('PATCH', url, { action: 'remove', version: player.version })).statusCode).toBe(409);
    expect((await request('PATCH', url, { action: 'remove', version: selected.json().version })).statusCode).toBe(200);
    expect((await request('GET', url)).statusCode).toBe(404);
    expect(await db.attachment.count({ where: { id: photo.id, deletedAt: null } })).toBe(1);
  });
});
async function processingPreview() {
  const entity = await club(); const file = (await uploadFile(entity.id)).json();
  const res = await request('POST', '/api/processing/preview', { attachmentId: file.id, attachmentVersion: file.version, adapterId: processor.id, text: 'Örnek özel sözleşme alıntısı' });
  expect(res.statusCode, res.body).toBe(201); return { preview: res.json() as ProcessingPreview, file, entity };
}
describe('sensitive paths: files and per-document processing', () => {
  it('keeps suggestion attachments private and rechecks the linked records before download', async () => {
    await seedExamples(db);
    const suggestion = await db.suggestion.findFirstOrThrow({ where: { requestId: exampleId('request') } });
    const files = `/api/records/Suggestion/${suggestion.id}/files`;
    expect((await app.inject({ url: files })).statusCode).toBe(401);
    expect((await request('GET', `/api/records/Suggestion/${suggestion.id}`)).statusCode).toBe(400);
    const uploaded = await uploadFile(suggestion.id, pdfFile, 'application/pdf', '', 'Suggestion');
    expect(uploaded.statusCode).toBe(201);
    const file = uploaded.json();
    expect((await request('GET', files)).json().items).toEqual([file]);
    expect(await db.attachment.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({
      entityType: 'Suggestion', entityId: suggestion.id, isExample: true,
    });
    const download = await request('POST', `/api/files/${file.id}/download`, { version: file.version });
    expect(download.statusCode).toBe(200);
    expect((await request('GET', download.json().url)).rawPayload).toEqual(pdfFile);
    await db.person.update({ where: { id: suggestion.personId }, data: { deletedAt: new Date() } });
    expect((await request('GET', files)).statusCode).toBe(404);
    expect((await request('GET', download.json().url)).statusCode).toBe(404);
    expect((await uploadFile(suggestion.id, pdfFile, 'application/pdf', '', 'Suggestion')).statusCode).toBe(404);
  });
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
    const source = { sourceUrl: 'https://example.com/profile-source', sourceType: 'OFFICIAL', retrievedAt: '2026-11-02T00:00:00Z', verificationStatus: 'UNVERIFIED' };
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
  it('exports a live recommendation dossier using only approved document fields', async () => {
    await seedExamples(db);
    await db.player.update({ where: { id: exampleId('player-0') }, data: {
      birthDate: encrypt('2000-02-01', 'Player.birthDate'), notes: 'Örnek özel oyuncu bilgisi',
    } });
    await db.request.update({ where: { id: exampleId('request') }, data: { salaryMax: '555123.45', salaryCurrency: 'EUR' } });
    const suggestion = await db.suggestion.findFirstOrThrow({ where: { requestId: exampleId('request') } });
    const path = `/api/documents/recommendation/${suggestion.id}`;
    const input = { format: 'docx', language: 'en', version: suggestion.version };
    expect((await app.inject({ method: 'POST', url: path, headers: { origin }, payload: input })).statusCode).toBe(401);
    expect((await request('POST', path, { ...input, version: suggestion.version + 1 })).statusCode).toBe(409);
    const result = await request('POST', path, input);
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-disposition']).toContain('metodo-recommendation-en.docx');
    const archive = await JSZip.loadAsync(result.rawPayload);
    const xml = await archive.file('word/document.xml')!.async('string');
    expect(xml).toContain('Transfer recommendation dossier');
    expect(xml).toContain(suggestion.whyGoodTransfer);
    expect(xml).not.toMatch(/2000-02-01|555123|özel oyuncu bilgisi|v1\.dev\./u);
    const log = await db.timelineEvent.findFirstOrThrow({ where: { entityId: suggestion.requestId, action: 'export' } });
    expect(log.diffs).toMatchObject({
      template: 'recommendation-1',
      sourceVersions: expect.arrayContaining([{ type: 'Suggestion', id: suggestion.id, version: suggestion.version }]),
    });
    await db.person.update({ where: { id: suggestion.personId }, data: { deletedAt: new Date() } });
    expect((await request('POST', path, input)).statusCode).toBe(404);
    expect(await db.timelineEvent.count({ where: { entityId: suggestion.requestId, action: 'export' } })).toBe(1);
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

describe('transfer request workspace', () => {
  it('validates request criteria, scopes contacts, lists statuses and preserves historical requesters', async () => {
    await seedExamples(db);
    const clubId = exampleId('club-0');
    const requesterId = exampleId('person-0-1');
    const outsideContact = await db.person.create({ data: { name: 'Örnek Bağlantısız Kişi', searchName: 'ornek baglantisiz kisi', isExample: true } });
    await db.relation.create({ data: {
      fromType: 'Person', fromId: outsideContact.id, toType: 'Club', toId: clubId,
      relation: 'memberOf', startDate: new Date('2098-01-01'), isExample: true,
    } });
    await db.relation.updateMany({ where: { fromId: requesterId, toId: clubId }, data: { endDate: new Date('2098-01-01') } });
    const contacts = await request('GET', `/api/requests/contacts?clubId=${clubId}`);
    expect(contacts.statusCode).toBe(200);
    expect(contacts.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: requesterId })]));
    expect(contacts.body).not.toContain(outsideContact.id);
    const data = {
      name: 'Örnek ŞİLE Orta Saha', clubId, requesterId, position: 'CM', ageMin: 20, ageMax: 28,
      salaryMax: '0.00', salaryCurrency: 'EUR', preferredLeagues: ['Örnek Lig'],
      profileText: 'Örnek profil', deadline: '2031-06-01',
    };
    expect((await request('POST', '/api/requests', { ...data, requesterId: outsideContact.id })).statusCode).toBe(400);
    expect((await request('POST', '/api/requests', { ...data, salaryCurrency: null })).statusCode).toBe(400);
    const response = await request('POST', '/api/requests', data);
    expect(response.statusCode).toBe(201);
    const row = response.json();
    const path = `/api/records/Request/${row.id}`;
    expect((await request('GET', '/api/requests?status=OPEN&q=sile')).json().items)
      .toEqual([expect.objectContaining({ id: row.id, requester: { id: requesterId, name: expect.any(String) }, salaryMax: '0' })]);
    expect((await request('GET', `/api/requests/${exampleId('request')}/suggestions`)).json().items[0])
      .toMatchObject({ player: expect.objectContaining({ id: exampleId('player-0') }) });
    expect((await request('PATCH', path, { version: row.version, changes: { ageMin: 29 } })).statusCode).toBe(400);
    expect((await request('PATCH', path, { version: row.version, changes: { salaryMax: null } })).statusCode).toBe(400);
    expect((await request('POST', '/api/suggestions', {
      requestId: row.id, requestVersion: row.version + 1, personId: requesterId, playerId: exampleId('player-0'), whyGoodTransfer: 'Örnek eşleşme',
    })).statusCode).toBe(409);
    await db.relation.updateMany({ where: { fromId: requesterId, toId: clubId }, data: { endDate: new Date(istanbulToday()) } });
    const moved = await request('PATCH', path, { version: row.version, changes: { status: 'MATCHED', deadline: null } });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ status: 'MATCHED', deadline: null, ageMin: 20, ageMax: 28 });
    expect((await request('PATCH', path, { version: row.version, changes: { status: 'CLOSED' } })).statusCode).toBe(409);
    expect((await request('GET', '/api/requests?status=MATCHED&q=sile')).json().total).toBe(1);
    expect(await db.timelineEvent.count({ where: { entityId: row.id, action: 'update' } })).toBe(1);
  });
});

describe('sensitive paths: transfer matching', () => {
  it('uses valid private evidence, masks the response and audit, and recalculates with saved weights', async () => {
    await seedExamples(db);
    const clubId = exampleId('club-0');
    const row = await db.request.update({
      where: { id: exampleId('request') },
      data: { ageMin: 20, ageMax: 40, preferredFoot: 'LEFT', salaryMax: '13000', salaryCurrency: 'EUR', feeMax: '1000', feeCurrency: 'EUR' },
    });
    const player = await db.player.create({ data: {
      name: 'Örnek Eşleşme Oyuncusu', searchName: 'ornek eslesme oyuncusu', isExample: true,
      primaryPosition: 'CM', preferredFoot: 'RIGHT', birthDate: encrypt('2000-01-01', 'Player.birthDate'),
      currentClubId: clubId, marketValue: '125.00', marketValueCurrency: 'EUR',
    } });
    const contract = await db.contract.create({ data: {
      name: 'Örnek Eşleşme Sözleşmesi', isExample: true, playerId: player.id, clubId, type: 'EMPLOYMENT',
      startDate: new Date('2020-01-01'), endDate: new Date('2098-01-01'),
      salaryAmount: encrypt('12345.67', 'Contract.salaryAmount'), salaryCurrency: 'EUR', salaryBasis: 'GROSS', salaryPeriod: 'YEAR',
    } });
    const path = `/api/requests/${row.id}/matches`;
    const query = { q: 'eslesme', sort: 'score', page: 1 };
    expect((await app.inject({ method: 'POST', url: path, headers: { origin }, payload: query })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: path, headers: { origin, cookie }, payload: query })).statusCode).toBe(403);
    const first = await request('POST', path, query);
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json().items).toEqual([expect.objectContaining({ id: player.id, score: 75, coverage: 67 })]);
    expect(first.json().items[0].criteria).toContainEqual({ criterion: 'fee', points: null, reason: 'missing' });
    expect(first.body).not.toMatch(/12345|2000-01-01|salaryAmount|birthDate|125\.00/);
    const audits = await db.auditLog.findMany({ where: { action: 'reveal', entityId: { in: [player.id, contract.id] } }, select: { diffs: true } });
    expect(audits).toEqual(expect.arrayContaining([{ diffs: { field: 'birthDate' } }, { diffs: { field: 'salaryAmount' } }]));
    expect((await request('POST', path, { ...query, page: 2 })).json().items).toEqual([]);
    expect(await db.auditLog.count({ where: { action: 'reveal', entityId: { in: [player.id, contract.id] } } })).toBe(4);
    await db.salesListing.create({ data: {
      name: 'Örnek Bonservis İlanı', isExample: true, playerId: player.id, clubId,
      status: 'OPEN', scope: 'OWNER', askingAmount: '876.54', currency: 'EUR',
    } });
    const mandate = await db.mandate.create({ data: {
      name: 'Örnek Bonservis Yetkisi', isExample: true, playerId: player.id, clubId,
      startDate: new Date('2020-01-01'), endDate: new Date('2098-01-01'), scope: 'Örnek kapsam',
    } });
    const prefs = (await request('GET', '/api/settings')).json();
    const updated = await request('PATCH', '/api/settings', { version: prefs.version, matchingWeights: {
      weights: { position: 1, age: 1, foot: 0, passport: 1, salary: 1, fee: 1, level: 1, availability: 1 }, levelMinimum: null,
    } });
    expect(updated.statusCode).toBe(200);
    const second = await request('POST', path, query);
    expect(second.json().items).toEqual([expect.objectContaining({ id: player.id, score: 100, coverage: 80 })]);
    expect(second.body).not.toContain('876.54');
    await db.contract.update({ where: { id: contract.id }, data: { salaryPeriod: null } });
    const final = await request('POST', path, query);
    expect(final.json().items[0].criteria).toContainEqual({ criterion: 'salary', points: null, reason: 'missing' });
    await db.mandate.update({ where: { id: mandate.id }, data: { deletedAt: new Date() } });
    expect((await request('POST', path, query)).json().items[0].criteria).toContainEqual({ criterion: 'fee', points: null, reason: 'missing' });
    expect((await db.request.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(row.version);
    expect(await db.suggestion.count()).toBe(1);
  });
});


describe('presentation workspace', () => {
  it('shows the latest result on both matrix axes with deterministic ties and scoped peers', async () => {
    await seedExamples(db);
    const input = {
      name: 'Örnek Sunum', clubId: exampleId('club-0'), personId: exampleId('person-0-1'), playerId: exampleId('player-0'),
      date: new Date('2026-01-01'), followUpDate: new Date('2026-01-10'), note: 'Örnek özel sunum notu', isExample: true,
    };
    await db.presentation.create({ data: { ...input, result: 'REJECTED' } });
    const newest = await db.presentation.create({ data: { ...input, date: new Date('2098-01-01'), result: 'INTERESTED', createdAt: new Date('2098-01-01') } });
    await db.presentation.create({ data: { ...input, date: newest.date, result: 'WAITING', createdAt: new Date('2097-01-01') } });
    for (const axis of ['Club', 'Person']) {
      const response = await request('GET', `/api/presentation-matrix?axis=${axis}`);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().cells).toContainEqual(expect.objectContaining({ id: newest.id, result: 'INTERESTED' }));
      expect(response.body).not.toContain(input.note);
    }
    expect((await app.inject({ url: '/api/presentation-matrix' })).statusCode).toBe(401);
    expect((await request('GET', '/api/presentation-matrix?ownerId=other')).statusCode).toBe(400);
    expect((await request('GET', '/api/presentation-matrix?rowPage=2')).json().rows).toEqual([]);
    await db.person.update({ where: { id: input.personId }, data: { deletedAt: new Date() } });
    expect((await request('GET', '/api/presentation-matrix')).json().cells).toEqual([]);
    expect((await request('GET', `/api/presentations/${newest.id}`)).statusCode).toBe(404);
  });
  it('records manual presentations and versioned updates and excludes resolved follow-ups', async () => {
    await seedExamples(db);
    const input = {
      clubId: exampleId('club-0'), personId: exampleId('person-0-1'), playerId: exampleId('player-0'),
      date: istanbulToday(), followUpDate: '2020-01-01', channel: 'IN_PERSON', result: 'WAITING', note: 'Örnek manuel sunum',
    };
    expect((await request('POST', '/api/presentations', { ...input, personId: exampleId('person-1-1') })).statusCode).toBe(400);
    const result = await request('POST', '/api/presentations', input);
    expect(result.statusCode, result.body).toBe(201);
    const record = result.json();
    expect((await request('GET', '/api/presentations?overdue=true')).json().items.some((row: { id: string }) => row.id === record.id)).toBe(true);
    expect((await request('GET', '/api/overview')).json().followUps).toContainEqual(expect.objectContaining({ id: record.id }));
    const data = { version: record.version, date: input.date, followUpDate: input.followUpDate, channel: 'VIDEO', result: 'REJECTED', note: 'Örnek kapalı sunum' };
    expect((await request('PATCH', `/api/presentations/${record.id}`, data)).statusCode).toBe(200);
    expect((await request('PATCH', `/api/presentations/${record.id}`, data)).statusCode).toBe(409);
    expect((await request('GET', '/api/overview')).json().followUps.some((row: { id: string }) => row.id === record.id)).toBe(false);
    expect((await request('GET', '/api/presentations?overdue=true')).json().items.some((row: { id: string }) => row.id === record.id)).toBe(false);
    const events = await db.timelineEvent.findMany({ where: { entityId: record.id, action: 'update' } });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(data.note);
  });
});

describe('sensitive paths: authorized club sales', () => {
  it('requires a current exact club mandate, prevents duplicate open listings and preserves decimal amounts', async () => {
    await seedExamples(db);
    const clubId = exampleId('club-0'); const playerId = exampleId('player-0');
    const listing = { askingAmount: '9007199254740991.99', currency: 'EUR', status: 'OPEN', confidentiality: 'PRIVATE', scope: 'Örnek satış kapsamı' };
    const path = `/api/clubs/${clubId}/sales`;
    expect((await request('POST', path, { ...listing, playerId })).json()).toMatchObject({ code: 'MANDATE_REQUIRED' });
    const mandateInput = {
      name: 'Örnek Kulüp Yetkisi', scope: 'Örnek kapsam', startDate: '2020-01-01', endDate: '2098-01-01',
      exclusive: false, sourceUrl: 'https://example.com/mandate', documentRef: null,
    };
    expect((await request('POST', `/api/clubs/${clubId}/mandates`, { ...mandateInput, playerId, endDate: '2019-01-01' })).statusCode).toBe(400);
    const mandate = await request('POST', `/api/clubs/${clubId}/mandates`, { ...mandateInput, playerId });
    expect(mandate.statusCode).toBe(201);
    const results = await Promise.all([request('POST', path, { ...listing, playerId }), request('POST', path, { ...listing, playerId })]);
    expect(results.map(row => row.statusCode).sort()).toEqual([201, 409]);
    const listed = (await request('GET', path)).json().items.find((row: { playerId: string }) => row.playerId === playerId);
    expect(listed).toMatchObject({ askingAmount: listing.askingAmount, authorized: true, confidentiality: 'PRIVATE' });
    expect((await request('POST', path, { ...listing, playerId, status: 'CLOSED' })).statusCode).toBe(201);
    const salesView = `/api/clubs/${clubId}/sections/players?players=sales`;
    expect((await request('GET', salesView)).json().items).toContainEqual(expect.objectContaining({ id: playerId }));
    const changes = { ...mandateInput, endDate: '2020-12-31', version: 1 };
    expect((await request('PATCH', `/api/mandates/${mandate.json().id}`, changes)).statusCode).toBe(200);
    expect((await request('PATCH', `/api/mandates/${mandate.json().id}`, changes)).statusCode).toBe(409);
    expect((await request('GET', path)).json().items.find((row: { id: string }) => row.id === listed.id).authorized).toBe(false);
    expect((await request('GET', salesView)).json().items.some((row: { id: string }) => row.id === playerId)).toBe(false);
    expect((await request('PATCH', `/api/sales/${listed.id}`, { ...listing, status: 'OPEN', version: 1 })).json().code).toBe('MANDATE_REQUIRED');
    expect((await request('PATCH', `/api/sales/${listed.id}`, { ...listing, status: 'CLOSED', version: 1 })).statusCode).toBe(200);
    expect((await request('GET', '/api/export/Player')).body).not.toContain(listing.askingAmount);
    expect(JSON.stringify(await db.auditLog.findMany({ where: { entityId: listed.id } }))).not.toContain(listing.askingAmount);
    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect((await db.mandate.findUniqueOrThrow({ where: { id: mandate.json().id } })).fieldProvenance).toMatchObject({
      scope: { sourceType: 'MANUAL' }, sourceUrl: { sourceType: 'MANUAL' },
    });
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
    const original = await db.request.findUniqueOrThrow({ where: { id: exampleId('request') }, include: { requester: true } });
    const res = await request('POST', '/api/suggestions', { requestId: exampleId('request'), playerId: exampleId('player-1'), personId: exampleId('person-0-1'), whyGoodTransfer: 'Örnek uyum' });
    expect(res.statusCode).toBe(201); expect(res.json().matchScore).toBeNull();
    const entries = await db.timelineEvent.findMany({ where: { batchId: res.json().batchId }, orderBy: { entityType: 'asc' } });
    expect(entries.map(entry => entry.entityType)).toEqual(['Club', 'Person', 'Player', 'Request']);
    const presentation = await db.presentation.findFirstOrThrow({ where: { playerId: exampleId('player-1') } });
    expect(presentation).toMatchObject({ channel: 'EMAIL', result: 'PENDING', requestId: original.id });
    expect(presentation.followUpDate.getTime() - presentation.date.getTime()).toBe(5 * 86400_000);
    const day = presentation.date.toISOString().slice(0, 10);
    const relation = await db.relation.findFirstOrThrow({ where: { fromId: presentation.playerId, relation: 'suggestedTo' } });
    expect(relation.note).toBe(`${original.requester?.name} · ${original.name} · ${day}`);
    expect(entries.every(entry => entry.summaryTr.endsWith(day) && entry.summaryEn.endsWith(day))).toBe(true);
    expect(await db.request.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ status: 'SUGGESTED', version: original.version + 1 });
  });
  it('records the selected presentation channel and follow-up with the suggestion', async () => {
    await seedExamples(db);
    const data = {
      requestId: exampleId('request'), playerId: exampleId('player-1'), personId: exampleId('person-0-1'),
      whyGoodTransfer: 'Örnek görüşme', matchScore: 0, followUpDate: '2098-11-19', channel: 'VIDEO',
    };
    expect((await request('POST', '/api/suggestions', { ...data, channel: 'UNKNOWN' })).statusCode).toBe(400);
    const res = await request('POST', '/api/suggestions', data);
    expect(res.statusCode).toBe(201);
    expect(res.json().matchScore).toBe('0');
    expect(await db.presentation.findFirstOrThrow({ where: { playerId: data.playerId } })).toMatchObject({
      clubId: exampleId('club-0'), personId: data.personId, requestId: data.requestId, channel: data.channel,
      result: 'PENDING', followUpDate: new Date(data.followUpDate), note: data.whyGoodTransfer,
    });
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
  it('requires separate versioned owner verification and resets evidence when its field changes', async () => {
    const source = { sourceUrl: 'https://example.com/official', sourceType: 'OFFICIAL', retrievedAt: '2026-11-02T00:00:00Z', verificationStatus: 'UNVERIFIED' };
    const fields = { name: 'Örnek Kaynak', city: 'Örnek Şehir', isTracked: true, fieldProvenance: { city: source } };
    const verifiedSource = { ...source, verificationStatus: 'VERIFIED' };
    expect((await request('POST', '/api/clubs', { ...fields, fieldProvenance: { city: verifiedSource } })).statusCode).toBe(400);
    expect((await request('POST', '/api/clubs', { ...fields, fieldProvenance: { city: { ...source, sourceUrl: 'https://example:example@example.com/source' } } })).statusCode).toBe(400);
    const created = await request('POST', '/api/clubs', fields);
    expect(created.statusCode).toBe(201); const row = created.json();
    expect(row.fieldProvenance.city).toEqual(source); expect(row.fieldProvenance.name.sourceType).toBe('MANUAL');
    const path = `/api/records/Club/${row.id}`;
    const input = { field: 'city', version: row.version, sourceUrl: source.sourceUrl };
    expect((await request('PATCH', path, { version: row.version, changes: { city: fields.city, fieldProvenance: { city: verifiedSource } } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `${path}/verify-field`, headers: { cookie, origin }, payload: input })).statusCode).toBe(403);
    expect((await request('POST', `${path}/verify-field`, { ...input, field: 'name' })).statusCode).toBe(400);
    expect((await request('POST', `${path}/verify-field`, { ...input, sourceUrl: 'https://example.com/changed' })).statusCode).toBe(409);
    expect((await request('POST', `${path}/verify-field`, input)).json()).toEqual({ version: row.version + 1, verificationStatus: 'VERIFIED' });
    expect((await request('POST', `${path}/verify-field`, input)).statusCode).toBe(409);
    expect((await request('GET', path)).json().fieldProvenance).toMatchObject({ city: verifiedSource, name: row.fieldProvenance.name });
    expect(await db.auditLog.count({ where: { action: 'verify', entityId: row.id } })).toBe(1);
    const edited = await request('PATCH', path, { version: row.version + 1, changes: { city: 'Örnek Yeni Şehir' } });
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
