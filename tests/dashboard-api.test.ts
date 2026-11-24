import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import type { Overview } from '../src/types.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let sequence = 0; let address = '';
function request(method: 'GET' | 'PATCH', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
const settings = async () => (await request('GET', '/api/settings')).json();
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(','); await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-22T20:59:59Z')); address = `127.10.0.${++sequence}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); expect(login.statusCode).toBe(200); cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterEach(() => vi.useRealTimers()); afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('sensitive paths: dashboard layout and bounded projections', () => {
  it('saves order and visibility without changing unrelated preferences or source records', async () => {
    const before = await settings(); expect(before.dashboardLayout).toEqual([]);
    const layout = [{ id: 'tasks', visible: false }, { id: 'summary', visible: true }];
    const saved = await request('PATCH', '/api/settings', { version: before.version, dashboardLayout: layout }); expect(saved.statusCode, saved.body).toBe(200);
    expect(await settings()).toMatchObject({ dashboardLayout: layout, version: before.version + 1, language: before.language, theme: before.theme, notificationThresholds: before.notificationThresholds });
    expect(await db.task.count()).toBe(0); expect(await db.meeting.count()).toBe(0); expect(await db.timelineEvent.count({ where: { entityType: 'UserSettings', action: 'update' } })).toBe(1);
    const row = await db.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } }); await settings(); expect((await db.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } })).version).toBe(row.version);
  });
  it('rejects stale/concurrent saves atomically and leaves only the winning layout', async () => {
    const before = await settings(); const layouts = [[{ id: 'tasks', visible: false }], [{ id: 'activity', visible: true }]];
    const results = await Promise.all(layouts.map(dashboardLayout => request('PATCH', '/api/settings', { version: before.version, dashboardLayout })));
    expect(results.map(row => row.statusCode).sort()).toEqual([200, 409]); const winner = results.findIndex(row => row.statusCode === 200);
    expect((await settings()).dashboardLayout).toEqual(layouts[winner]); expect(await db.timelineEvent.count({ where: { entityType: 'UserSettings', action: 'update' } })).toBe(1);
    expect((await request('PATCH', '/api/settings', { version: before.version, dashboardLayout: [] })).statusCode).toBe(409);
  });
  it('enforces strict layout inputs, owner sessions and CSRF', async () => {
    const before = await settings();
    for (const dashboardLayout of [[{ id: 'tasks', visible: true }, { id: 'tasks', visible: false }], [{ id: 'future', visible: true }], [{ id: 'tasks', visible: 1 }], [{ id: 'tasks', visible: true, ownerId: 'other' }]]) expect((await request('PATCH', '/api/settings', { version: before.version, dashboardLayout })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/overview' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'PATCH', url: '/api/settings', headers: { cookie, origin }, payload: { version: before.version, dashboardLayout: [] } })).statusCode).toBe(403);
    expect((await settings()).version).toBe(before.version);
  });
  it('bounds today/week independently so earlier meetings cannot crowd today out, including Istanbul midnight', async () => {
    await db.task.createMany({ data: ['2026-11-21', '2026-11-22', '2026-11-23'].map(dueDate => ({ name: 'Örnek Görev ' + dueDate, dueDate: new Date(dueDate), isExample: true })) });
    await db.task.createMany({ data: [{ name: 'Örnek Tamamlanan', dueDate: new Date('2026-11-22'), status: 'DONE', isExample: true }, { name: 'Örnek Silinen', dueDate: new Date('2026-11-22'), deletedAt: new Date(), isExample: true }] });
    await db.meeting.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ name: `Örnek Önceki ${index}`, date: new Date('2026-11-16'), time: '09:00', isExample: true })) });
    const current = await db.meeting.create({ data: { name: 'Örnek Bugün', date: new Date('2026-11-22'), time: '11:00', isExample: true } });
    await db.meeting.createMany({ data: ['2026-11-23', '2026-11-29', '2026-11-30'].map(date => ({ name: 'Örnek Tarih ' + date, date: new Date(date), time: '10:00', isExample: true })) });
    const first: Overview = (await request('GET', '/api/overview')).json(); expect(first).toMatchObject({ today: '2026-11-22', weekFrom: '2026-11-16', weekTo: '2026-11-22' });
    expect(first.todayTasks).toHaveLength(1); expect(first.todayTasks[0].dueDate.slice(0, 10)).toBe('2026-11-22'); expect(first.todayMeetings.map(row => row.id)).toEqual([current.id]); expect(first.weekMeetings).toHaveLength(6); expect(first.weekMeetings.some(row => row.id === current.id)).toBe(false);
    vi.setSystemTime(new Date('2026-11-22T21:00:00Z')); const second: Overview = (await request('GET', '/api/overview')).json(); expect(second).toMatchObject({ today: '2026-11-23', weekFrom: '2026-11-23', weekTo: '2026-11-29' });
    expect(second.todayTasks).toHaveLength(1); expect(second.todayMeetings).toHaveLength(1); expect(second.weekMeetings.map(row => row.date.slice(0, 10))).toEqual(['2026-11-23', '2026-11-29']);
  });
  it('projects only widget fields and excludes foreign/deleted records and private audit details', async () => {
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    await db.task.createMany({ data: [{ name: 'Örnek Yabancı Görev', ownerId: 'other', dueDate: new Date('2026-11-22'), isExample: true }, { name: 'Örnek Açık', dueDate: new Date('2026-11-22'), generationKey: 'Örnek internal', isExample: true }] });
    await db.meeting.createMany({ data: [{ name: 'Örnek Yabancı Görüşme', ownerId: 'other', date: new Date('2026-11-22'), time: '09:00', isExample: true }, { name: 'Örnek Silinmiş Görüşme', deletedAt: new Date(), date: new Date('2026-11-22'), time: '09:00', isExample: true }, { name: 'Örnek Özel Görüşme', date: new Date('2026-11-22'), time: '10:00', notes: 'Örnek private meeting content', isExample: true }] });
    await db.timelineEvent.create({ data: { actor: 'owner', action: 'update', entityType: 'Meeting', entityId: 'Örnek entity', batchId: 'Örnek batch', diffs: { secret: 'Örnek private audit content' }, summaryTr: 'Örnek değişiklik', summaryEn: 'Örnek change', isExample: true } });
    const response = await request('GET', '/api/overview'); const output: Overview = response.json(); expect(response.statusCode).toBe(200);
    expect(output.todayTasks).toHaveLength(1); expect(output.todayMeetings).toHaveLength(1);
    expect(Object.keys(output.todayTasks[0]).sort()).toEqual(['dueDate', 'id', 'name', 'priority']); expect(Object.keys(output.todayMeetings[0]).sort()).toEqual(['date', 'durationMin', 'id', 'name', 'time']); expect(Object.keys(output.recent[0]).sort()).toEqual(['createdAt', 'entityId', 'entityType', 'id', 'summaryEn', 'summaryTr']);
    for (const value of ['Örnek Yabancı', 'Örnek Silinmiş', 'private meeting content', 'private audit content', 'generationKey', 'diffs', 'birthDate', 'salaryAmount', 'phone', 'email']) expect(response.body).not.toContain(value);
  });
});
