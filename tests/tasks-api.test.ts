import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import { istanbulToday } from '../shared/domain.js';
import { seedExamples, exampleId } from '../prisma/seed.js';
import type { TaskDetail, TaskInput } from '../shared/tasks.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let sequence = 0; let address = '';
const draft = (changes: Partial<TaskInput> = {}): TaskInput => ({ name: 'Örnek Şahin Görevi', priority: 'HIGH', dueDate: '2026-01-31', recurrence: 'NONE', linkedEntity: null, ...changes });
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload }) }); }
async function create(input = draft()): Promise<TaskDetail> { const res = await request('POST', '/api/tasks', input); expect(res.statusCode, res.body).toBe(201); return res.json(); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(',');
  await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`); address = `127.5.0.${++sequence}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } });
  expect(login.statusCode).toBe(200); cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = (await app.inject({ url: '/api/me', remoteAddress: address, headers: { cookie } })).json().csrfToken;
});
afterAll(async () => { await app.close(); await db.$disconnect(); });

describe('sensitive paths: versioned task workspace', () => {
  it('creates, edits, filters, completes, reopens and restores tasks without exposing internal data', async () => {
    const row = await create(draft({ dueDate: istanbulToday() })); const path = `/api/tasks/${row.id}`;
    expect(row).toMatchObject({ version: 1, status: 'OPEN', recurrenceGenerated: false, linkedEntity: null });
    expect(row).not.toHaveProperty('generationKey'); expect(row).not.toHaveProperty('ownerId');
    const stored = await db.task.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.fieldProvenance).toMatchObject({ name: { sourceType: 'MANUAL', verificationStatus: 'UNVERIFIED' } });
    expect((await request('GET', '/api/tasks?q=sahin&due=today')).json()).toMatchObject({ total: 1, items: [{ id: row.id }] });
    expect((await request('PATCH', path, { version: 1, changes: { name: 'Örnek Şahin Güncel', priority: 'LOW' } })).json()).toMatchObject({ name: 'Örnek Şahin Güncel', priority: 'LOW', version: 2 });
    expect((await request('PATCH', path, { version: 1, changes: { name: 'Örnek eski' } })).statusCode).toBe(409);
    expect((await request('DELETE', path, { version: 2 })).statusCode).toBe(200); expect((await request('GET', path)).statusCode).toBe(404);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 3 })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 4 })).json().task).toMatchObject({ status: 'DONE', version: 5, successor: null });
    expect((await request('GET', '/api/tasks?status=DONE')).json().total).toBe(1);
    expect((await request('POST', path + '/reopen', { version: 5 })).json()).toMatchObject({ status: 'OPEN', version: 6 });
    expect((await request('POST', path + '/reopen', { version: 6 })).statusCode).toBe(409);
    const overview = (await request('GET', '/api/overview')).json(); expect(overview.tasks).toHaveLength(1);
    expect(Object.keys(overview.tasks[0]).sort()).toEqual(['id', 'name', 'dueDate', 'priority'].sort());
    const timeline = (await request('GET', path + '/timeline')).json();
    expect(timeline.some((event: { diffs: unknown }) => JSON.stringify(event.diffs).includes('Örnek Şahin Güncel'))).toBe(true);
  });
  it('atomically creates one next occurrence from the original due date, even after late completion', async () => {
    for (const recurrence of ['WEEKLY', 'MONTHLY'] as const) {
      const row = await create(draft({ recurrence }));
      await db.task.update({ where: { id: row.id }, data: { isExample: true } });
      const result = await request('POST', `/api/tasks/${row.id}/complete`, { version: 1 }); expect(result.statusCode, result.body).toBe(200);
      const completed: TaskDetail = result.json().task; const next = completed.successor!;
      expect(completed).toMatchObject({ version: 2, status: 'DONE', recurrenceGenerated: true });
      expect(next.dueDate).toBe(recurrence === 'WEEKLY' ? '2026-02-07' : '2026-03-31');
      expect(await db.task.findUniqueOrThrow({ where: { id: next.id } })).toMatchObject({ version: 1, status: 'OPEN', isExample: true, recurrenceGenerated: false, generationKey: `repeat:${row.id}` });
      const events = await db.timelineEvent.findMany({ where: { OR: [{ entityId: row.id, action: 'update' }, { entityId: next.id }] } });
      expect(events).toHaveLength(2); expect(events[0].batchId).toBe(events[1].batchId);
    }
    expect(await db.task.count()).toBe(4);
  });
  it('rejects concurrent and stale completion without duplicate successors or audit events', async () => {
    const row = await create(draft({ recurrence: 'MONTHLY' })); const path = `/api/tasks/${row.id}/complete`;
    const results = await Promise.all([request('POST', path, { version: 1 }), request('POST', path, { version: 1 })]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
    expect(await db.task.count()).toBe(2); expect(await db.task.count({ where: { generationKey: `repeat:${row.id}` } })).toBe(1);
    expect(await db.timelineEvent.count({ where: { entityType: 'Task' } })).toBe(3);
    expect((await request('POST', path, { version: 1 })).statusCode).toBe(409);
    expect((await request('POST', path, { version: 2 })).statusCode).toBe(409);
  });
  it('preserves edited/deleted successors and the consumed marker after reopening and at the year limit', async () => {
    const row = await create(draft({ recurrence: 'MONTHLY' })); const path = `/api/tasks/${row.id}`;
    const next = (await request('POST', path + '/complete', { version: 1 })).json().task.successor;
    expect((await request('PATCH', `/api/tasks/${next.id}`, { version: 1, changes: { name: 'Örnek Bağımsız Sonraki', dueDate: '2028-04-01' } })).statusCode).toBe(200);
    expect((await request('POST', path + '/reopen', { version: 2 })).statusCode).toBe(200);
    expect((await request('PATCH', path, { version: 3, changes: { dueDate: '9999-12-31' } })).statusCode).toBe(200);
    const reused = (await request('POST', path + '/complete', { version: 4 })).json();
    expect(reused).toMatchObject({ reused: true, task: { version: 5, successor: { id: next.id, name: 'Örnek Bağımsız Sonraki', dueDate: '2028-04-01' } } });
    expect((await request('DELETE', `/api/tasks/${next.id}`, { version: 2 })).statusCode).toBe(200);
    expect((await request('POST', path + '/reopen', { version: 5 })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 6 })).json()).toMatchObject({ reused: true, task: { successor: { deleted: true } } });
    expect(await db.task.count()).toBe(2);
    expect((await db.task.findUniqueOrThrow({ where: { id: next.id } })).deletedAt).not.toBeNull();
  });
  it('never recreates a hard-purged successor and retains the source marker through Trash restore', async () => {
    const row = await create(draft({ recurrence: 'MONTHLY' })); const path = `/api/tasks/${row.id}`;
    const next = (await request('POST', path + '/complete', { version: 1 })).json().task.successor;
    expect((await request('DELETE', `/api/tasks/${next.id}`, { version: 1 })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: next.id } });
    const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json(); expect(plan.counts.Task).toBe(1);
    expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: 2, previewToken: plan.previewToken })).statusCode).toBe(200);
    expect((await request('DELETE', path, { version: 2 })).statusCode).toBe(200);
    const sourceTrash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    expect((await request('POST', `/api/trash/${sourceTrash.id}/restore`, { version: sourceTrash.version, recordVersion: 3 })).statusCode).toBe(200);
    expect((await request('POST', path + '/reopen', { version: 4 })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 5 })).json()).toMatchObject({ reused: true, task: { successorMissing: true, recurrenceGenerated: true, successor: null } });
    expect(await db.task.count()).toBe(1);
  });
  it('requires valid owner links for new references, recurrence copies and Trash restore', async () => {
    const club = (await request('POST', '/api/clubs', { name: 'Örnek Bağlı Kulüp' })).json();
    const row = await create(draft({ recurrence: 'WEEKLY', linkedEntity: { type: 'Club', id: club.id } })); const path = `/api/tasks/${row.id}`;
    const foreignOwner = await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const foreign = await db.club.create({ data: { ownerId: foreignOwner.id, name: 'Örnek Başka Kulüp', searchName: 'ornek baska kulup' } });
    expect((await request('POST', '/api/tasks', draft({ linkedEntity: { type: 'Club', id: foreign.id } }))).statusCode).toBe(409);
    expect((await request('PATCH', path, { version: 1, changes: { linkedEntity: { type: 'Club', id: foreign.id } } })).statusCode).toBe(409);
    await db.club.update({ where: { id: club.id }, data: { deletedAt: new Date() } });
    expect((await request('GET', '/api/tasks/links?type=Club')).json().items).toEqual([]);
    expect((await request('GET', path)).json()).toMatchObject({ linkedEntity: null, linkUnavailable: true });
    expect((await request('PATCH', path, { version: 1, changes: { name: 'Örnek Tarihsel Bağlantı' } })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 2 })).statusCode).toBe(409);
    expect(await db.task.count()).toBe(1); expect((await db.task.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('OPEN');
    expect((await request('DELETE', path, { version: 2 })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 3 })).statusCode).toBe(409);
    await db.club.update({ where: { id: club.id }, data: { deletedAt: null } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 3 })).statusCode).toBe(200);
    expect((await request('PATCH', path, { version: 4, changes: { linkedEntity: null } })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 5 })).json().task.successor).not.toBeNull();
  });
  it('blocks finite-date recurrence until the owner explicitly removes it', async () => {
    const row = await create(draft({ dueDate: '9999-12-31', recurrence: 'MONTHLY' })); const path = `/api/tasks/${row.id}`;
    expect((await request('POST', path + '/complete', { version: 1 })).json().code).toBe('RECURRENCE_LIMIT');
    expect(await db.task.count()).toBe(1); expect((await db.task.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(1);
    expect((await request('PATCH', path, { version: 1, changes: { recurrence: 'NONE' } })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 2 })).json().task).toMatchObject({ status: 'DONE', recurrenceGenerated: false });
  });
  it('projects only safe link names and hides Contract links when their Player becomes unavailable', async () => {
    const created = await request('POST', '/api/players', { name: 'Örnek Özel Bağlantı', primaryPosition: 'CM', status: 'OWN', birthDate: '2000-01-01' });
    expect(created.statusCode, created.body).toBe(201); const player = created.json();
    await db.player.update({ where: { id: player.id }, data: { phone: encrypt('+905550001122', 'Player.phone'), healthNotes: encrypt('Örnek gizli sağlık notu', 'Player.healthNotes') } });
    const contract = await db.contract.create({ data: { name: 'Örnek Özel Sözleşme', playerId: player.id, type: 'EMPLOYMENT', startDate: new Date('2026-01-01'), endDate: new Date('2028-01-01'), salaryAmount: encrypt('98765.43', 'Contract.salaryAmount') } });
    const row = await create(draft({ linkedEntity: { type: 'Contract', id: contract.id } }));
    expect(row.linkedEntity).toEqual({ type: 'Contract', id: contract.id, name: contract.name });
    for (const type of ['Player', 'Contract']) {
      const response = await request('GET', `/api/tasks/links?type=${type}`);
      expect(response.statusCode).toBe(200); expect(Object.keys(response.json().items[0]).sort()).toEqual(['id', 'name']);
      for (const forbidden of ['2000-01-01', '+905550001122', 'Örnek gizli sağlık notu', '98765.43', 'salaryAmount', 'birthDate', 'fieldProvenance']) expect(response.body).not.toContain(forbidden);
    }
    expect(await db.auditLog.count({ where: { action: 'reveal' } })).toBe(0);
    await db.player.update({ where: { id: player.id }, data: { deletedAt: new Date() } });
    expect((await request('GET', '/api/tasks/links?type=Contract')).json().items).toEqual([]);
    expect((await request('GET', `/api/tasks/${row.id}`)).json()).toMatchObject({ linkedEntity: null, linkUnavailable: true });
  });
  it('guards proposal targets without exposing excerpts or accepting unsupported target dispatch', async () => {
    const club = (await request('POST', '/api/clubs', { name: 'Örnek Öneri Kulübü' })).json();
    const proposal = await db.updateProposal.create({ data: { name: 'Örnek Bekleyen Öneri', type: 'coach_departure', targetType: 'Club', targetId: club.id, summary: 'Örnek gizli alıntı', payload: { privateExcerpt: 'Örnek gizli alıntı' } } });
    const unsupported = await db.updateProposal.create({ data: { name: 'Örnek Desteklenmeyen Öneri', type: 'other', targetType: 'MedicalRecord', targetId: club.id, summary: 'Örnek gizli alıntı', payload: {} } });
    const result = await request('GET', '/api/tasks/links?type=UpdateProposal');
    expect(result.json().items).toEqual([{ id: proposal.id, name: proposal.name }]); expect(result.body).not.toContain('Örnek gizli alıntı');
    expect((await request('POST', '/api/tasks', draft({ linkedEntity: { type: 'UpdateProposal', id: unsupported.id } }))).statusCode).toBe(409);
    const task = await create(draft({ linkedEntity: { type: 'UpdateProposal', id: proposal.id } }));
    await db.club.update({ where: { id: club.id }, data: { deletedAt: new Date() } });
    expect((await request('GET', `/api/tasks/${task.id}`)).json()).toMatchObject({ linkedEntity: null, linkUnavailable: true });
  });
  it('rolls back both canonical tasks and both events if successor logging fails', async () => {
    const row = await create(draft({ recurrence: 'MONTHLY' }));
    await db.$executeRawUnsafe(`CREATE FUNCTION fail_repeat_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."entityType" = 'Task' AND NEW.action = 'create' AND NEW.diffs->'new'->>'repeatedFrom' IS NOT NULL THEN RAISE EXCEPTION 'example log failure'; END IF; RETURN NEW; END $$`);
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER fail_repeat_event BEFORE INSERT ON "TimelineEvent" FOR EACH ROW EXECUTE FUNCTION fail_repeat_event()`);
      expect((await request('POST', `/api/tasks/${row.id}/complete`, { version: 1 })).statusCode).toBe(500);
    } finally { await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_repeat_event ON "TimelineEvent"'); await db.$executeRawUnsafe('DROP FUNCTION fail_repeat_event()'); }
    expect(await db.task.count()).toBe(1); expect(await db.timelineEvent.count()).toBe(1); expect(await db.auditLog.count()).toBe(1);
    expect(await db.task.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ version: 1, status: 'OPEN', recurrenceGenerated: false });
  });
  it('continues recurrence from each occurrence and keeps future tasks after an earlier one is purged', async () => {
    const row = await create(draft({ recurrence: 'MONTHLY' })); const path = `/api/tasks/${row.id}`;
    const next = (await request('POST', path + '/complete', { version: 1 })).json().task.successor;
    const later = (await request('POST', `/api/tasks/${next.id}/complete`, { version: 1 })).json().task.successor;
    expect(later.dueDate).toBe('2026-05-31'); expect(await db.task.count()).toBe(3);
    expect((await request('POST', path + '/reopen', { version: 2 })).statusCode).toBe(200);
    expect((await request('POST', path + '/complete', { version: 3 })).json().task.successor).toMatchObject({ id: next.id, status: 'DONE' });
    expect(await db.task.count()).toBe(3);
    expect((await request('DELETE', path, { version: 4 })).statusCode).toBe(200);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json(); expect(plan.counts.Task).toBe(1);
    expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: 5, previewToken: plan.previewToken })).statusCode).toBe(200);
    expect(await db.task.count()).toBe(2); expect((await request('GET', `/api/tasks/${later.id}`)).json()).toMatchObject({ status: 'OPEN', dueDate: '2026-05-31' });
  });
  it('preserves example/recurrence state across seeding and removes example occurrences without cyclic cleanup', async () => {
    await seedExamples(db); const id = exampleId('task');
    expect((await request('PATCH', `/api/tasks/${id}`, { version: 1, changes: { name: 'prefix removed' } })).json().code).toBe('EXAMPLE_NAME_REQUIRED');
    expect((await db.task.findUniqueOrThrow({ where: { id } })).version).toBe(1);
    expect((await request('PATCH', `/api/tasks/${id}`, { version: 1, changes: { recurrence: 'MONTHLY', dueDate: '2026-01-31' } })).statusCode).toBe(200);
    expect((await request('POST', `/api/tasks/${id}/complete`, { version: 2 })).statusCode).toBe(200);
    const manual = await create(); await seedExamples(db);
    expect(await db.task.count({ where: { isExample: true } })).toBe(2);
    expect(await db.task.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'DONE', recurrenceGenerated: true });
    const preview = (await request('GET', '/api/admin/examples/preview')).json(); expect(preview.counts.Task).toBe(2);
    expect((await request('POST', '/api/admin/examples/cleanup', { previewToken: preview.previewToken })).statusCode).toBe(200);
    expect(await db.task.count()).toBe(1); expect(await db.task.findUnique({ where: { id: manual.id } })).not.toBeNull();
  });
  it('enforces authentication, CSRF, origin and strict field ownership on every task route', async () => {
    const row = await create(); const path = `/api/tasks/${row.id}`;
    expect((await app.inject({ url: '/api/tasks' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: path + '/complete', headers: { cookie, origin }, payload: { version: 1 } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: path + '/complete', headers: { cookie, origin: 'https://example.com', 'x-csrf-token': csrf }, payload: { version: 1 } })).statusCode).toBe(403);
    for (const changes of [{ status: 'DONE' }, { recurrenceGenerated: false }, { generationKey: 'repeat:example' }, { ownerId: 'other' }]) expect((await request('PATCH', path, { version: 1, changes })).statusCode).toBe(400);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const foreign = await db.task.create({ data: { ownerId: 'other', name: 'Örnek Başka Görev', dueDate: new Date('2026-01-01') } });
    for (const url of [`/api/tasks/${foreign.id}`, `/api/tasks/${foreign.id}/timeline`]) expect((await request('GET', url)).statusCode).toBe(404);
    for (const action of ['complete', 'reopen']) expect((await request('POST', `/api/tasks/${foreign.id}/${action}`, { version: 1 })).statusCode).toBe(404);
    expect((await request('DELETE', `/api/tasks/${foreign.id}`, { version: 1 })).statusCode).toBe(404);
    expect((await request('GET', '/api/tasks/links?type=MedicalRecord')).statusCode).toBe(400);
  });
});
