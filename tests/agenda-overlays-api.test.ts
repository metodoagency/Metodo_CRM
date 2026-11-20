import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import { normalizeSearch } from '../shared/domain.js';
import type { AgendaBirthdays, AgendaDeadlines } from '../shared/agenda-overlays.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let sequence = 0; let address = '';
function request(method: 'GET' | 'POST', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
const range = { from: '2026-11-01', to: '2026-11-30' };
const dateUrl = (value: Record<string, string> = range) => '/api/agenda/deadlines?' + new URLSearchParams(value);
async function player(name = 'Örnek Takvim Oyuncusu', ownerId = 'owner') { return db.player.create({ data: { name, searchName: normalizeSearch(name), ownerId, primaryPosition: 'CM', status: 'OWN', isExample: true } }); }
async function contract(playerId: string, extra: Partial<Prisma.ContractUncheckedCreateInput> = {}) {
  return db.contract.create({ data: { playerId, name: 'Örnek Şahin Sözleşmesi', type: 'EMPLOYMENT', startDate: new Date('2026-01-01'), endDate: new Date('2026-11-30'), isExample: true, ...extra } });
}
async function person(name: string, birthday: string, extra: Partial<Prisma.PersonCreateInput> = {}) { return db.person.create({ data: { name, searchName: normalizeSearch(name), birthDate: encrypt(birthday, 'Person.birthDate'), hideBirthYear: true, isExample: true, ...extra } }); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(','); await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-19T12:00:00Z')); address = `127.9.0.${++sequence}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); expect(login.statusCode).toBe(200); cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterEach(() => vi.useRealTimers()); afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('sensitive paths: contract and explicit birthday agenda layers', () => {
  it('opens and repairs a legacy payment day instead of linking an agenda warning to a broken detail', async () => {
    const p = await player(); const row = await contract(p.id, { paymentDay: 0 });
    await db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner', notificationThresholds: [30] }, update: { notificationThresholds: [30] } });
    const detail = await request('GET', `/api/contracts/${row.id}`); expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().dates.issues).toContainEqual({ field: 'paymentDay', code: 'INVALID_PAYMENT_DAY' });
    const agenda: AgendaDeadlines = (await request('GET', dateUrl())).json();
    expect(agenda.items).toContainEqual({ contractId: row.id, name: row.name, kind: 'CONTRACT_END', date: '2026-11-30' });
    expect(agenda.items.some(value => value.contractId === row.id && value.kind === 'PAYMENT_DAY')).toBe(false);
    expect(agenda.warnings).toContainEqual({ contractId: row.id, name: row.name, field: 'paymentDay', code: 'INVALID_PAYMENT_DAY' });
    const refreshed = await request('POST', '/api/contracts/reminders', {}); expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(await db.notification.count({ where: { entityId: row.id, type: 'CONTRACT_CONTRACT_END' } })).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { entityId: row.id, type: 'CONTRACT_PAYMENT_DAY' } })).toBe(0);
    const patched = await app.inject({ method: 'PATCH', url: `/api/contracts/${row.id}`, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, payload: { version: 1, changes: { paymentDay: 15 } } });
    expect(patched.statusCode, patched.body).toBe(200); expect((await request('GET', `/api/contracts/${row.id}`)).json().dates.issues).toEqual([]);
    expect((await request('GET', dateUrl())).json().warnings.some((value: { contractId: string }) => value.contractId === row.id)).toBe(false);
  });
  it('projects current date-only contracts and excludes inactive/deleted/foreign parents and every private value', async () => {
    const p = await player(); const c = await contract(p.id, { salaryAmount: encrypt('987654.32', 'Contract.salaryAmount'), bonuses: encrypt('Örnek özel bonus', 'Contract.bonuses'), releaseClause: { validFrom: '2026-11-20', amount: '876543.21', terms: 'Örnek özel madde' }, noticeDeadline: new Date('2026-11-21') });
    await contract(p.id, { isActive: false, name: 'Örnek Pasif' }); await contract(p.id, { deletedAt: new Date(), name: 'Örnek Silinmiş' });
    const deadPlayer = await player('Örnek Silinmiş Oyuncu'); await db.player.update({ where: { id: deadPlayer.id }, data: { deletedAt: new Date() } }); await contract(deadPlayer.id);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } }); const foreign = await player('Örnek Yabancı', 'other'); await contract(foreign.id, { ownerId: 'other' });
    const badClub = await db.club.create({ data: { name: 'Örnek Silinmiş Taraf', searchName: 'ornek silinmis taraf', deletedAt: new Date(), isExample: true } }); await contract(p.id, { clubId: badClub.id });
    const res = await request('GET', dateUrl()); expect(res.statusCode).toBe(200); const output: AgendaDeadlines = res.json(); expect(output.total).toBe(3); expect(output.items.every(row => row.contractId === c.id)).toBe(true);
    for (const row of output.items) expect(Object.keys(row).sort()).toEqual(['contractId', 'date', 'kind', 'name']);
    for (const value of ['987654.32', '876543.21', 'Örnek özel bonus', 'Örnek özel madde', 'salaryAmount', 'bonuses', 'releaseClause', 'ownerId']) expect(res.body).not.toContain(value);
    expect((await request('GET', dateUrl({ ...range, q: 'sahin' }))).json().total).toBe(3);
    await db.contract.update({ where: { id: c.id }, data: { noticeDeadline: new Date('2026-12-01') } });
    expect((await request('GET', dateUrl())).json().total).toBe(2); expect(await db.auditLog.count({ where: { action: 'reveal' } })).toBe(0);
  });
  it('shows full-range payments with disabled reminders and reports bad legacy rows independently', async () => {
    const p = await player(); await db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner', notificationThresholds: [] }, update: { notificationThresholds: [] } });
    await contract(p.id, { paymentDay: 1, endDate: new Date('2026-12-31') }); const bad = await contract(p.id, { name: 'Örnek Bozuk Ödeme', paymentDay: 0 });
    const skipped = await contract(p.id, { name: 'Örnek Atlanan Ödeme', paymentDay: 31, endDate: new Date('2026-03-31') });
    const res = await request('GET', dateUrl({ from: '2026-01-31', to: '2026-04-02' })); expect(res.statusCode, res.body).toBe(200); const output: AgendaDeadlines = res.json();
    expect(output.items.filter(row => row.name === 'Örnek Şahin Sözleşmesi').map(row => row.date)).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
    expect(output.warnings).toContainEqual({ contractId: bad.id, name: bad.name, code: 'INVALID_PAYMENT_DAY', field: 'paymentDay' });
    expect(output.warnings).toContainEqual({ contractId: skipped.id, name: skipped.name, code: 'SKIPPED_PAYMENT', month: '2026-02' }); expect(await db.notification.count()).toBe(0);
  });
  it('pages stable deadline identities without truncating the declared total', async () => {
    const p = await player(); await db.contract.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ playerId: p.id, name: `Örnek Sıralı ${i}`, type: 'EMPLOYMENT', startDate: new Date('2026-01-01'), endDate: new Date('2026-11-20'), isExample: true })) });
    const first: AgendaDeadlines = (await request('GET', dateUrl())).json(); const second: AgendaDeadlines = (await request('GET', dateUrl({ ...range, page: '2' }))).json();
    expect(first).toMatchObject({ total: 51, page: 1, pageSize: 50 }); expect(first.items).toHaveLength(50); expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(row => row.contractId)).size).toBe(51);
  });
  it('reveals only occurrence dates through explicit audited POST, with no canonical/reminder writes or generic GET/ICS leakage', async () => {
    const row = await person('Örnek Özel Şahin Doğum', '1995-11-20'); const res = await request('POST', '/api/agenda/birthdays/view', range); expect(res.statusCode).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    const output: AgendaBirthdays = res.json(); expect(output).toMatchObject({ total: 1, expiresIn: 60, expiresAt: '2026-11-19T12:01:00.000Z', items: [{ kind: 'Person', id: row.id, date: '2026-11-20' }] });
    expect(Object.keys(output.items[0]).sort()).toEqual(['date', 'id', 'kind', 'name']); expect(res.body).not.toContain('1995-11-20'); expect(output.items[0]).not.toHaveProperty('age');
    const audit = await db.auditLog.findMany({ where: { action: 'reveal' } }); expect(audit).toHaveLength(1); expect(audit[0]).toMatchObject({ entityType: 'Person', entityId: row.id, diffs: { field: 'birthDate' } }); expect(JSON.stringify(audit)).not.toContain('1995-11-20'); expect(JSON.stringify(audit[0].diffs)).not.toContain('2026-11-20');
    for (const url of ['/api/agenda?' + new URLSearchParams(range), dateUrl(), '/api/overview', '/api/notifications?view=all']) expect((await request('GET', url)).body).not.toContain(row.name);
    const ics = await request('POST', '/api/agenda/ics', range); expect(ics.statusCode).toBe(200); expect(ics.body).not.toContain(row.name); expect(ics.body).not.toContain('1995-11-20');
    expect(await db.notification.count()).toBe(0); expect((await db.person.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(1);
  });
  it('handles all birthday kinds, cross-year/leap dates and historical/finite-year boundaries', async () => {
    await person('Örnek Aralık', '1990-12-31'); const p = await player(); await db.player.update({ where: { id: p.id }, data: { birthDate: encrypt('1995-01-01', 'Player.birthDate') } });
    const a = await db.agent.create({ data: { name: 'Örnek Artık Gün', birthDate: encrypt('2000-02-29', 'Agent.birthDate'), isExample: true } });
    const cross: AgendaBirthdays = (await request('POST', '/api/agenda/birthdays/view', { from: '2026-12-15', to: '2027-01-15' })).json(); expect(cross.items.map(row => row.date)).toEqual(['2026-12-31', '2027-01-01']);
    expect((await request('POST', '/api/agenda/birthdays/view', { from: '2027-02-28', to: '2027-03-01' })).json().items).toContainEqual({ id: a.id, name: a.name, kind: 'Agent', date: '2027-03-01' });
    expect((await request('POST', '/api/agenda/birthdays/view', { from: '2028-02-28', to: '2028-03-01' })).json().items[0].date).toBe('2028-02-29');
    expect((await request('POST', '/api/agenda/birthdays/view', { from: '1989-12-31', to: '1989-12-31' })).json().total).toBe(0);
    expect((await request('POST', '/api/agenda/birthdays/view', { from: '9999-12-31', to: '9999-12-31' })).json().items[0].date).toBe('9999-12-31');
  });
  it('excludes invalid/future/deleted/foreign birthdays and audits only the explicitly selected page', async () => {
    const data = Array.from({ length: 51 }, (_, index) => ({ name: `Örnek Takvim ${String(index).padStart(3, '0')}`, searchName: `ornek takvim ${index}`, birthDate: encrypt('2000-11-20', 'Person.birthDate'), isExample: true })); await db.person.createMany({ data });
    await person('Örnek Silinmiş', '2000-11-20', { deletedAt: new Date() }); await person('Örnek Gelecek', '2027-11-20'); await person('Örnek Bozuk Tarih', 'invalid');
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } }); await db.person.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Doğum', searchName: 'ornek yabanci dogum', birthDate: encrypt('2000-11-20', 'Person.birthDate'), isExample: true } });
    const page2: AgendaBirthdays = (await request('POST', '/api/agenda/birthdays/view', { ...range, page: 2 })).json(); expect(page2).toMatchObject({ total: 51, page: 2 }); expect(page2.items).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: 'reveal' } })).toBe(1);
    const first: AgendaBirthdays = (await request('POST', '/api/agenda/birthdays/view', range)).json(); expect(first.items).toHaveLength(50); expect(await db.auditLog.count({ where: { action: 'reveal' } })).toBe(51);
    expect(new Set([...first.items, ...page2.items].map(row => row.id)).size).toBe(51);
    const auditBefore = await db.auditLog.count(); expect((await request('POST', '/api/agenda/birthdays/view', { ...range, q: 'unmatched' })).json().total).toBe(0); expect(await db.auditLog.count()).toBe(auditBefore);
  });
  it('rechecks live data on every reveal after edits/deletion, and enforces authentication, CSRF and strict bounded inputs', async () => {
    const row = await person('Örnek Değişen Doğum', '1990-11-20'); expect((await request('POST', '/api/agenda/birthdays/view', range)).json().total).toBe(1);
    await db.person.update({ where: { id: row.id }, data: { birthDate: encrypt('1990-12-20', 'Person.birthDate'), version: { increment: 1 } } }); expect((await request('POST', '/api/agenda/birthdays/view', range)).json().total).toBe(0);
    await db.person.update({ where: { id: row.id }, data: { deletedAt: new Date() } }); expect((await request('POST', '/api/agenda/birthdays/view', { from: '2026-12-01', to: '2026-12-31' })).json().total).toBe(0);
    expect((await app.inject({ url: dateUrl() })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/agenda/birthdays/view', headers: { cookie, origin }, payload: range })).statusCode).toBe(403);
    expect((await request('POST', '/api/agenda/birthdays/view', { from: '0001-01-01', to: '9999-12-31' })).statusCode).toBe(400);
    expect((await request('GET', dateUrl({ ...range, includeBirthdays: 'true' }))).statusCode).toBe(400);
    expect((await request('POST', '/api/agenda/birthdays/view', { ...range, ownerId: 'other' })).statusCode).toBe(400);
    expect((await request('GET', '/api/agenda/birthdays/view')).statusCode).toBe(404);
  });
});
