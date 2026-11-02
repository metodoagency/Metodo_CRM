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
    expect(readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.com', ALLOWED_EMAILS: 'owner@example.com', E2E_TEST_MODE: 'true', GOOGLE_CLIENT_ID: 'example', GOOGLE_CLIENT_SECRET: 'example', FIELD_ENCRYPTION_KEY: 'example', BLIND_INDEX_KEY: 'example' }).testAuth).toBe(false);
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
    expect((await request('POST', `/api/trash/${item.id}/restore`)).statusCode).toBe(200);
    expect((await request('GET', '/api/clubs')).json().total).toBe(1);
    await request('DELETE', `/api/records/Club/${row.id}`, { version: 3 });
    item = (await request('GET', '/api/trash')).json()[0];
    expect((await request('DELETE', `/api/trash/${item.id}`)).statusCode).toBe(200);
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
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { action: 'approve' })).statusCode).toBe(400);
    expect((await request('POST', `/api/proposals/${exampleId('proposal')}/review`, { action: 'approve', sourceUrl: 'https://example.com/source' })).statusCode).toBe(409);
  });
});
