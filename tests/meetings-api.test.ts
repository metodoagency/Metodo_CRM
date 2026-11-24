import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import ICAL from 'ical.js';
import type { MeetingDetail, MeetingInput, MeetingTaskPlan } from '../shared/meetings.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let seq = 0; let address = '';
const draft = (changes: Partial<MeetingInput> = {}): MeetingInput => ({ name: 'Örnek Şahin Görüşmesi', date: '2026-11-19', time: '23:30', durationMin: 90, utcOffsetSeconds: null,
  participants: [], locationOrUrl: 'Örnek özel konum', agenda: 'Örnek özel gündem', notes: 'Örnek özel not', outcome: 'Örnek özel sonuç', ...changes });
const task = { name: 'Örnek Takip', priority: 'HIGH', dueDate: '2026-11-20', recurrence: 'NONE' };
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
async function login() {
  const res = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } });
  expect(res.statusCode).toBe(200); cookie = String(res.headers['set-cookie']).split(';')[0];
  csrf = (await app.inject({ url: '/api/me', remoteAddress: address, headers: { cookie } })).json().csrfToken;
}
async function create(input = draft()): Promise<MeetingDetail> { const res = await request('POST', '/api/meetings', input); expect(res.statusCode, res.body).toBe(201); return res.json(); }
async function preview(row: MeetingDetail) { const res = await request('POST', `/api/meetings/${row.id}/tasks/preview`, { version: row.version, draft: task }); expect(res.statusCode, res.body).toBe(200); return res.json<MeetingTaskPlan>(); }
const commit = (row: MeetingDetail, plan: MeetingTaskPlan) => ({ version: row.version, draft: task, taskId: plan.taskId, expiresAt: plan.expiresAt, previewToken: plan.previewToken });
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(',');
  await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`); address = `127.8.0.${++seq}`; await login();
});
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('sensitive paths: versioned meetings and approved task commands', () => {
  it('exports versioned owner-only ICS without private fields, preserving UID/SEQUENCE and logging exports without changing versions', async () => {
    const row = await create(); const path = `/api/meetings/${row.id}/ics`;
    expect((await request('POST', path, { version: 2 })).statusCode).toBe(409);
    const res = await request('POST', path, { version: 1 }); expect(res.statusCode, res.body).toBe(200); expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('.ics'); expect(res.headers['cache-control']).toBe('no-store');
    const event = new ICAL.Component(ICAL.parse(res.body)).getFirstSubcomponent('vevent')!; expect(event.getFirstPropertyValue('uid')).toBe(`urn:uuid:${row.id}`); expect(event.getFirstPropertyValue('sequence')).toBe(1);
    for (const field of [row.notes, row.agenda, row.locationOrUrl!, row.outcome!]) expect(res.body).not.toContain(field);
    expect((await db.meeting.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(1);
    expect(await db.timelineEvent.count({ where: { entityId: row.id, action: 'export' } })).toBe(1);
    const outside = await create(draft({ date: '2026-12-01' }));
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const foreign = await db.meeting.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Takvim', date: new Date('2026-11-19'), time: '10:00' } });
    const range = await request('POST', '/api/agenda/ics', { from: '2026-11-19', to: '2026-11-19' }); expect(range.statusCode).toBe(200); expect(range.body).toContain(row.id); expect(range.body).not.toContain(outside.id); expect(range.body).not.toContain(foreign.id);
    expect((await request('POST', `/api/meetings/${foreign.id}/ics`, { version: 1 })).statusCode).toBe(404);
    await db.meeting.update({ where: { id: row.id }, data: { date: new Date('2015-11-08'), time: '03:30', utcOffsetSeconds: null } });
    expect((await request('POST', path, { version: 1 })).json().code).toBe('MEETING_EXPORT_TIME');
    expect(await db.timelineEvent.count({ where: { entityId: row.id, action: 'export' } })).toBe(2);
  });
  it('creates, filters, edits and restores a meeting with masked private audit and safe summaries', async () => {
    const row = await create(); const path = `/api/meetings/${row.id}`;
    expect(row).toMatchObject({ version: 1, utcOffsetSeconds: 10800, timing: { selected: { endDate: '2026-11-20', endTime: '01:00' } } });
    expect(row).not.toHaveProperty('ownerId'); expect(row).not.toHaveProperty('fieldProvenance');
    const list = (await request('GET', '/api/agenda?from=2026-11-19&to=2026-11-19&q=sahin')).json(); expect(list.total).toBe(1);
    for (const value of ['özel konum', 'özel gündem', 'özel not', 'özel sonuç']) {
      expect(JSON.stringify(list)).not.toContain(value); expect((await request('GET', '/api/overview')).body).not.toContain(value);
      expect((await request('GET', path + '/timeline')).body).not.toContain(value);
    }
    expect((await request('PATCH', path, { version: 1, changes: { notes: 'Örnek değiştirilmiş not' } })).json()).toMatchObject({ version: 2, name: row.name, notes: 'Örnek değiştirilmiş not' });
    expect((await request('PATCH', path, { version: 1, changes: { time: '10:00' } })).statusCode).toBe(409);
    expect((await request('DELETE', path, { version: 2 })).statusCode).toBe(200);
    expect((await request('GET', path)).statusCode).toBe(404);
    expect((await request('GET', '/api/agenda?from=2026-11-01&to=2026-11-30')).json().total).toBe(0);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 3 })).statusCode).toBe(200);
    expect((await request('GET', path)).json()).toMatchObject({ version: 4, notes: 'Örnek değiştirilmiş not' });
  });
  it('rejects gaps and demands an explicit repeated-hour choice, preserving it in sparse edits', async () => {
    const fold = draft({ date: '2015-11-08', time: '03:30' });
    expect((await request('POST', '/api/meetings', draft({ date: '2015-03-29', time: '03:30' }))).json().code).toBe('MEETING_TIME_GAP');
    expect((await request('POST', '/api/meetings', fold)).json().code).toBe('MEETING_TIME_AMBIGUOUS');
    const row = await create({ ...fold, utcOffsetSeconds: 7200 });
    expect(row.timing.selected?.instant).toBe('2015-11-08T01:30:00.000Z');
    const edited = (await request('PATCH', `/api/meetings/${row.id}`, { version: 1, changes: { durationMin: 60 } })).json();
    expect(edited).toMatchObject({ utcOffsetSeconds: 7200, timing: { selected: { instant: row.timing.selected?.instant } } });
    const moved = (await request('PATCH', `/api/meetings/${row.id}`, { version: 2, changes: { date: '2026-11-19' } })).json();
    expect(moved).toMatchObject({ utcOffsetSeconds: 10800 });
    expect(await db.meeting.count()).toBe(1);
  });
  it('validates new owner/live references but preserves unavailable and unknown legacy references on unrelated edits', async () => {
    const club = (await request('POST', '/api/clubs', { name: 'Örnek Katılan Kulüp' })).json();
    const person = (await request('POST', '/api/people', { name: 'Örnek Katılan Kişi' })).json();
    const row = await create(draft({ participants: [{ type: 'Club', id: club.id }] }));
    const picker = (await request('GET', '/api/meetings/participants?type=Club')).json(); expect(Object.keys(picker.items[0]).sort()).toEqual(['id', 'name']);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const other = await db.club.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Kulüp', searchName: 'ornek yabanci kulup' } });
    expect((await request('POST', '/api/meetings', draft({ participants: [{ type: 'Club', id: other.id }] }))).statusCode).toBe(409);
    const foreignMeeting = await db.meeting.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Görüşme', date: new Date('2026-11-19'), time: '10:00' } });
    expect((await request('GET', `/api/meetings/${foreignMeeting.id}`)).statusCode).toBe(404);
    await db.club.update({ where: { id: club.id }, data: { deletedAt: new Date() } });
    await db.meeting.update({ where: { id: row.id }, data: { participants: [{ type: 'Club', id: club.id }, { type: 'Club', id: club.id }] } });
    expect((await request('GET', `/api/meetings/${row.id}`)).json().legacyParticipants).toBe(true);
    const legacy = [{ type: 'Club', id: club.id }, { type: 'Club', id: club.id }, { email: 'private@example.com', name: 'Örnek Eski Özel' }];
    await db.meeting.update({ where: { id: row.id }, data: { participants: legacy } });
    const shown = await request('GET', `/api/meetings/${row.id}`); expect(shown.json()).toMatchObject({ legacyParticipants: true, participants: [{ unavailable: true }, { unavailable: true }, { reference: null }] });
    expect(shown.body).not.toContain('private@example.com'); expect(shown.body).not.toContain('Eski Özel');
    expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 1, changes: { notes: 'Örnek yeni' } })).statusCode).toBe(200);
    expect((await db.meeting.findUniqueOrThrow({ where: { id: row.id } })).participants).toEqual(legacy);
    expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 2, changes: { participants: [{ type: 'Club', id: club.id }] } })).statusCode).toBe(409);
    expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 2, changes: { participants: person.id ? [{ type: 'Person', id: person.id }] : [] } })).statusCode).toBe(200);
    expect((await request('GET', `/api/meetings/${row.id}/timeline`)).body).not.toContain('private@example.com');
  });
  it('keeps preview read-only and binds exact draft, identity, expiry, version and session before committing atomically', async () => {
    const row = await create(); const plan = await preview(row); const path = `/api/meetings/${row.id}/tasks`; const input = commit(row, plan);
    expect(plan.changes).toMatchObject({ createTask: { ...task, id: plan.taskId, linkedEntity: { type: 'Meeting', id: row.id } }, updateMeeting: { beforeVersion: 1, afterVersion: 2 } });
    expect(await db.task.count()).toBe(0); expect((await db.meeting.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(1);
    expect((await request('POST', path, { ...input, draft: { ...task, name: 'Örnek Değiştirilmiş' } })).json().code).toBe('STALE_PREVIEW');
    expect((await request('POST', path, { ...input, taskId: '11111111-1111-4111-8111-111111111111' })).statusCode).toBe(409);
    expect((await request('POST', path, { ...input, expiresAt: '2000-01-01T00:00:00Z' })).statusCode).toBe(409);
    const firstCookie = cookie; const firstCsrf = csrf; await login();
    expect((await request('POST', path, input)).json().code).toBe('STALE_PREVIEW'); cookie = firstCookie; csrf = firstCsrf;
    expect((await request('POST', path, input)).json()).toEqual({ taskId: plan.taskId, meetingVersion: 2 });
    expect(await db.task.findUniqueOrThrow({ where: { id: plan.taskId } })).toMatchObject({ entityType: 'Meeting', entityId: row.id, status: 'OPEN', generationKey: `meeting:${row.id}:1` });
    expect((await request('POST', path, input)).statusCode).toBe(409); expect(await db.task.count()).toBe(1);
    const events = await db.timelineEvent.findMany({ where: { action: { in: ['create', 'update'] }, OR: [{ entityType: 'Task' }, { entityType: 'Meeting', action: 'update' }] } });
    expect(events).toHaveLength(2); expect(events[0].batchId).toBeTruthy(); expect(events[0].batchId).toBe(events[1].batchId);
  });
  it('rejects stale and concurrent approvals and rolls back on a task collision', async () => {
    const row = await create(); const plan = await preview(row); const path = `/api/meetings/${row.id}/tasks`;
    await request('PATCH', `/api/meetings/${row.id}`, { version: 1, changes: { notes: 'Örnek güncelleme' } });
    expect((await request('POST', path, commit(row, plan))).statusCode).toBe(409); expect(await db.task.count()).toBe(0);
    const updated: MeetingDetail = (await request('GET', `/api/meetings/${row.id}`)).json(); const next = await preview(updated);
    const results = await Promise.all([request('POST', path, commit(updated, next)), request('POST', path, commit(updated, next))]);
    expect(results.map(res => res.statusCode).sort()).toEqual([200, 409]); expect(await db.task.count()).toBe(1);
    const another = await create(); const bad = await preview(another);
    await db.task.create({ data: { id: bad.taskId, name: 'Örnek Çakışan', dueDate: new Date(task.dueDate) } });
    expect((await request('POST', `/api/meetings/${another.id}/tasks`, commit(another, bad))).statusCode).toBe(409);
    expect((await db.meeting.findUniqueOrThrow({ where: { id: another.id } })).version).toBe(1);
    expect(await db.timelineEvent.count({ where: { entityId: another.id, action: 'update' } })).toBe(0);
  });
  it('preserves example flags and allows reciprocal Meeting/Task Trash recovery without restoring either implicitly', async () => {
    const row = await create(); await db.meeting.update({ where: { id: row.id }, data: { isExample: true } }); const plan = await preview(row);
    expect((await request('POST', `/api/meetings/${row.id}/tasks`, commit(row, plan))).statusCode).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: plan.taskId } })).isExample).toBe(true);
    expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 2, changes: { participants: [{ type: 'Task', id: plan.taskId }] } })).statusCode).toBe(200);
    expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 3, changes: { name: 'Bad example' } })).statusCode).toBe(400);
    await request('DELETE', `/api/tasks/${plan.taskId}`, { version: 1 }); await request('DELETE', `/api/meetings/${row.id}`, { version: 3 });
    const meetingTrash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } }); const taskTrash = await db.trashEntry.findFirstOrThrow({ where: { entityId: plan.taskId } });
    expect((await request('POST', `/api/trash/${taskTrash.id}/restore`, { version: taskTrash.version, recordVersion: 2 })).statusCode).toBe(409);
    expect((await request('POST', `/api/trash/${meetingTrash.id}/restore`, { version: meetingTrash.version, recordVersion: 4 })).statusCode).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id: plan.taskId } })).deletedAt).not.toBeNull();
    expect((await request('POST', `/api/trash/${taskTrash.id}/restore`, { version: taskTrash.version, recordVersion: 2 })).statusCode).toBe(200);
  });
  it('applies authentication, CSRF, strict schema and bounded range guards to all new endpoints', async () => {
    expect((await app.inject({ url: '/api/agenda?from=2026-11-19&to=2026-11-19' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/meetings/time-preview', headers: { cookie, origin }, payload: draft() })).statusCode).toBe(403);
    for (const query of ['from=2026-01-01&to=2026-04-01', 'from=2026-11-20&to=2026-11-19', 'from=2026-02-30&to=2026-03-01']) expect((await request('GET', '/api/agenda?' + query)).statusCode).toBe(400);
    expect((await request('POST', '/api/meetings', { ...draft(), ownerId: 'other' })).statusCode).toBe(400);
    const row = await create(); expect((await request('PATCH', `/api/meetings/${row.id}`, { version: 1, changes: { participants: [{ type: 'Owner', id: row.id }] } })).statusCode).toBe(400);
  });
});
