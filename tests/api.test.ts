import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { decrypt } from '../server/crypto.js';
import { hash } from '../server/auth.js';
import { seedExamples, exampleId } from '../prisma/seed.js';
import { keyring } from '../server/crypto.js';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dailyJobs } from '../server/jobs.js';
import { apiContracts } from '../shared/contracts.js';
import { openapiDocument } from '../server/openapi.js';

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
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(m => `"${m.dbName || m.name}"`).join(',');
  await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  expect((await login()).statusCode).toBe(200);
});
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('security baseline', () => {
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
