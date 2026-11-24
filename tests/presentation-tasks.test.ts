import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { catchUpPresentationTasks } from '../server/presentation-tasks.js';
import { cleanupExamples, examplePreview, retentionTables } from '../server/lifecycle.js';
import { createSuggestion } from '../server/suggestions.js';
import type { PresentationRulePreview } from '../shared/presentation-tasks.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let sequence = 0; let address = '';
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(',')} CASCADE`);
  address = `127.6.0.${++sequence}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterAll(async () => { await app.close(); await db.$disconnect(); });
async function fixture(isExample = true) {
  const club = await db.club.create({ data: { name: 'Örnek Takip Kulübü', searchName: 'ornek takip kulubu', isExample } });
  const player = await db.player.create({ data: { name: 'Örnek Takip Oyuncusu', searchName: 'ornek takip oyuncusu', primaryPosition: 'CM', isExample } });
  const person = await db.person.create({ data: { name: 'Örnek Takip Kişisi', searchName: 'ornek takip kisisi', role: 'OFFICIAL', isExample } });
  await db.relation.create({ data: { fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'contactOf', startDate: new Date('2000-01-01'), isExample } });
  const row = await db.presentation.create({ data: { name: 'Örnek Takip Sunumu', clubId: club.id, playerId: player.id, personId: person.id, date: new Date('2026-01-01'), followUpDate: new Date('2026-12-20'), isExample } });
  return { row, club, player, person };
}
async function preview(enabled: boolean, sourceIds: string[] = []) {
  const state = (await request('GET', '/api/task-rules/presentation')).json();
  const result = await request('POST', '/api/task-rules/presentation/preview', { version: state.version, enabled, sourceIds }); expect(result.statusCode, result.body).toBe(200); return result.json<PresentationRulePreview>();
}
async function enable(ids: string[] = []) { const p = await preview(true, ids); const result = await request('POST', '/api/task-rules/presentation/confirm', p); expect(result.statusCode, result.body).toBe(200); return p; }

describe('sensitive paths: owner-approved presentation task rule', () => {
  it('defaults off, never sweeps unselected historical records, and rejects general-settings bypass', async () => {
    const { row } = await fixture();
    expect((await request('GET', '/api/task-rules/presentation')).json()).toMatchObject({ enabled: false, since: null, ruleVersion: 1 });
    expect(await catchUpPresentationTasks(db)).toEqual({ created: 0 });
    expect((await request('PATCH', '/api/settings', { version: 1, presentationFollowUpTasksEnabled: true })).statusCode).toBe(400);
    await enable(); expect(await catchUpPresentationTasks(db)).toEqual({ created: 0 }); expect(await db.task.count()).toBe(0);
    const p = await preview(true, [row.id]); expect(p.tasks[0].input).toMatchObject({ dueDate: '2026-12-20', priority: 'MEDIUM', recurrence: 'NONE', linkedEntity: { type: 'Presentation', id: row.id } });
    expect(await db.task.count()).toBe(0); expect((await request('POST', '/api/task-rules/presentation/confirm', p)).json()).toEqual({ ok: true, created: 1 });
    expect((await request('POST', '/api/task-rules/presentation/confirm', p)).statusCode).toBe(409);
    expect(await db.task.count()).toBe(1); expect(await db.taskGenerationReceipt.count()).toBe(1);
  });
  it('rejects tampering, source/parent/settings changes, cross-session replay, expired previews and missing CSRF', async () => {
    const { row, player } = await fixture(); const p = await preview(true, [row.id]);
    expect((await request('POST', '/api/task-rules/presentation/confirm', { ...p, tasks: [{ ...p.tasks[0], input: { ...p.tasks[0].input, dueDate: '2027-01-01' } }] })).statusCode).toBe(409);
    await db.player.update({ where: { id: player.id }, data: { version: { increment: 1 } } });
    expect((await request('POST', '/api/task-rules/presentation/confirm', p)).statusCode).toBe(409);
    const fresh = await preview(true, [row.id]);
    try { vi.spyOn(Date, 'now').mockReturnValue(Date.parse(fresh.expiresAt) + 1); expect((await request('POST', '/api/task-rules/presentation/confirm', fresh)).statusCode).toBe(409); } finally { vi.restoreAllMocks(); }
    const second = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } });
    const secondCookie = String(second.headers['set-cookie']).split(';')[0]; const secondCsrf = (await app.inject({ url: '/api/me', remoteAddress: address, headers: { cookie: secondCookie } })).json().csrfToken;
    expect((await app.inject({ method: 'POST', url: '/api/task-rules/presentation/confirm', remoteAddress: address, headers: { cookie: secondCookie, origin, 'x-csrf-token': secondCsrf }, payload: fresh })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/task-rules/presentation/confirm', remoteAddress: address, headers: { cookie, origin }, payload: fresh })).statusCode).toBe(403);
    expect(await db.task.count()).toBe(0);
  });
  it('preserves edited/completed/purged tasks and deduplicates date changes, restore and re-enabling', async () => {
    const { row } = await fixture(); await enable([row.id]);
    const task = await db.task.findFirstOrThrow();
    await db.task.update({ where: { id: task.id }, data: { name: 'Örnek Sahip Düzenlemesi', status: 'DONE', dueDate: new Date('2028-01-01'), version: 2 } });
    const patch = (followUpDate: string, version: number) => request('PATCH', `/api/presentations/${row.id}`, { version, date: '2026-01-01', channel: 'EMAIL', result: 'PENDING', followUpDate, note: '' });
    expect((await patch('2026-12-21', 1)).statusCode).toBe(200); expect(await db.task.count()).toBe(2);
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ name: 'Örnek Sahip Düzenlemesi', status: 'DONE', dueDate: new Date('2028-01-01') });
    expect((await request('DELETE', `/api/tasks/${task.id}`, { version: 2 })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: task.id } }); const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json();
    expect(plan.counts.TaskGenerationReceipt).toBeUndefined();
    expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: 3, previewToken: plan.previewToken })).statusCode).toBe(200);
    expect((await patch('2026-12-20', 2)).statusCode).toBe(200); expect(await db.task.count()).toBe(1); expect(await db.taskGenerationReceipt.count()).toBe(2);
    const off = await preview(false); expect((await request('POST', '/api/task-rules/presentation/confirm', off)).statusCode).toBe(200);
    await enable([row.id]); expect(await db.task.count()).toBe(1); expect(await catchUpPresentationTasks(db)).toEqual({ created: 0 });
    expect(retentionTables.find(table => table.type === 'TaskGenerationReceipt')?.mode).toBe('protected');
  });
  it('generates inside manual create and R3, with shared batches and complete rollback on receipt failure', async () => {
    const { club, player, person } = await fixture(); await enable();
    const input = { clubId: club.id, playerId: player.id, personId: person.id, date: '2026-01-01', followUpDate: '2026-12-25', channel: 'EMAIL', result: 'PENDING', note: '' };
    const made = await request('POST', '/api/presentations', input); expect(made.statusCode, made.body).toBe(201);
    const task = await db.task.findFirstOrThrow({ where: { entityId: made.json().id } }); expect(task.isExample).toBe(true); expect(task.name).toMatch(/^Örnek/);
    const events = await db.timelineEvent.findMany({ where: { OR: [{ entityId: task.id }, { entityId: made.json().id }] } }); expect(new Set(events.map(event => event.batchId)).size).toBe(1);
    const requestRow = await db.request.create({ data: { name: 'Örnek Takip Talebi', clubId: club.id, position: 'CM', deadline: new Date('2026-12-30'), isExample: true } });
    await createSuggestion(db, { requestId: requestRow.id, playerId: player.id, personId: person.id, channel: 'EMAIL', matchScore: null, whyGoodTransfer: 'Örnek kaynak', followUpDate: '2026-12-26' }, true);
    expect(await db.task.count()).toBe(2);
    const before = { suggestions: await db.suggestion.count(), presentations: await db.presentation.count(), tasks: await db.task.count(), relations: await db.relation.count(), timeline: await db.timelineEvent.count(), request: await db.request.findUniqueOrThrow({ where: { id: requestRow.id } }) };
    await db.$executeRawUnsafe(`ALTER TABLE "TaskGenerationReceipt" ADD CONSTRAINT "test_block_receipt" CHECK ("sourceVersion" < 0) NOT VALID`);
    try { await expect(createSuggestion(db, { requestId: requestRow.id, playerId: player.id, personId: person.id, channel: 'EMAIL', matchScore: null, whyGoodTransfer: 'Örnek rollback', followUpDate: '2026-12-27' }, true)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe(`ALTER TABLE "TaskGenerationReceipt" DROP CONSTRAINT "test_block_receipt"`); }
    expect(await db.suggestion.count()).toBe(before.suggestions); expect(await db.presentation.count()).toBe(before.presentations); expect(await db.task.count()).toBe(before.tasks); expect(await db.relation.count()).toBe(before.relations); expect(await db.timelineEvent.count()).toBe(before.timeline); expect((await db.request.findUniqueOrThrow({ where: { id: requestRow.id } })).version).toBe(before.request.version);
  });
  it('handles concurrent confirmations/catch-up, excludes rejected and unavailable records, and cleans example receipts', async () => {
    const { row, club } = await fixture(); const p = await preview(true, [row.id]);
    expect((await Promise.all([request('POST', '/api/task-rules/presentation/confirm', p), request('POST', '/api/task-rules/presentation/confirm', p)])).map(result => result.statusCode).sort()).toEqual([200, 409]);
    const second = await db.presentation.create({ data: { name: 'Örnek Uyku Sonrası', clubId: club.id, personId: row.personId, playerId: row.playerId, date: row.date, followUpDate: new Date('2027-01-01'), isExample: true } });
    await Promise.all([catchUpPresentationTasks(db), catchUpPresentationTasks(db)]); expect(await db.task.count({ where: { entityId: second.id } })).toBe(1);
    await db.presentation.update({ where: { id: second.id }, data: { result: 'REJECTED' } });
    expect((await request('GET', '/api/task-rules/presentation/candidates')).json().items.map((item: { id: string }) => item.id)).not.toContain(second.id);
    await db.club.update({ where: { id: club.id }, data: { deletedAt: new Date() } });
    expect((await preview(true, [row.id])).skipped).toEqual([{ sourceId: row.id, reason: 'UNAVAILABLE' }]);
    const plan = await db.$transaction(tx => examplePreview(tx)); expect(plan.result.counts.TaskGenerationReceipt).toBe(2);
    await cleanupExamples(db, plan.result.previewToken); expect(await db.taskGenerationReceipt.count()).toBe(0); expect(await db.task.count()).toBe(0);
  });
  it('skips an invalid legacy date without blocking valid sources and rejects new year-zero inputs', async () => {
    const { row } = await fixture();
    const invalid = await db.presentation.create({ data: { name: 'Örnek Geçersiz Eski Tarih', clubId: row.clubId, personId: row.personId, playerId: row.playerId, date: row.date, followUpDate: row.followUpDate, isExample: true } });
    await db.$executeRaw`UPDATE "Presentation" SET "followUpDate" = DATE '0001-01-01 BC' WHERE id = ${invalid.id}::uuid`;
    const p = await preview(true, [invalid.id, row.id]); expect(p.tasks.map(task => task.sourceId)).toEqual([row.id]); expect(p.skipped).toEqual([{ sourceId: invalid.id, reason: 'INVALID_DATE' }]);
    expect((await request('POST', '/api/task-rules/presentation/confirm', p)).statusCode).toBe(200); expect(await db.task.count()).toBe(1);
    await db.$executeRaw`UPDATE "Presentation" SET "followUpDate" = DATE '0001-01-01 BC' WHERE id = ${row.id}::uuid`;
    const task = await db.task.findFirstOrThrow();
    expect((await request('GET', `/api/tasks/${task.id}`)).json()).toMatchObject({ automation: { current: false } });
    await db.presentation.update({ where: { id: invalid.id }, data: { createdAt: new Date(Date.now() + 1000) } });
    expect(await catchUpPresentationTasks(db)).toEqual({ created: 0 });
    expect((await request('POST', '/api/presentations', { clubId: row.clubId, personId: row.personId, playerId: row.playerId, date: '2026-01-01', followUpDate: '0000-01-01', channel: 'EMAIL', result: 'PENDING', note: '' })).statusCode).toBe(400);
  });
});
