import { randomUUID } from 'node:crypto';
import type { PrismaClient, Task } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams, versionInput } from '../shared/contracts.js';
import { istanbulToday, normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { nextTaskOccurrence, taskCreate, taskDate, taskLinkQuery, taskPatch, taskQuery, type TaskActionResult, type TaskDetail, type TaskInput, type TaskRecord, type TaskSuccessor } from '../shared/tasks.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { requireTaskLink, resolveTaskLink, taskLinkRecords } from './task-parent.js';
import { presentationLive } from './presentation-parent.js';

const date = (value: Date) => Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : 'INVALID_DATE';
const key = (id: string) => `repeat:${id}`;
async function requireTask(tx: Tx, id: string) {
  const row = await tx.task.findFirst({ where: { ...live, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
function fields(input: Partial<TaskInput>) {
  const { linkedEntity, dueDate, ...rest } = input;
  return { ...rest, ...(dueDate === undefined ? {} : { dueDate: new Date(dueDate) }),
    ...(linkedEntity === undefined ? {} : { entityType: linkedEntity?.type ?? null, entityId: linkedEntity?.id ?? null }) };
}
function audit(row: Task) {
  return { name: row.name, priority: row.priority, dueDate: date(row.dueDate), status: row.status, recurrence: row.recurrence, entityType: row.entityType, entityId: row.entityId };
}
export function requireExampleName(isExample: boolean, name: string) {
  if (isExample && !/^(?:Örnek|ÖRNEK)/u.test(name)) throw new AppError('EXAMPLE_NAME_REQUIRED');
}
async function dto(tx: Tx, row: Task): Promise<TaskRecord> {
  const linkedEntity = await resolveTaskLink(tx, row.entityType, row.entityId);
  const dueDate = date(row.dueDate); const invalidDate = !taskDate.safeParse(dueDate).success;
  const receipt = await tx.taskGenerationReceipt.findFirst({ where: { ownerId: live.ownerId, taskId: row.id } });
  const source = receipt ? await tx.presentation.findFirst({ where: { ...presentationLive, id: receipt.entityId, result: { not: 'REJECTED' } }, select: { followUpDate: true } }) : null;
  return { id: row.id, version: row.version, name: row.name, priority: row.priority, dueDate, status: row.status,
    automation: receipt ? { sourceDate: date(receipt.targetDate), current: !!source && date(source.followUpDate) === date(receipt.targetDate) } : null,
    recurrence: row.recurrence, isExample: row.isExample, linkedEntity,
    linkUnavailable: !!(row.entityType || row.entityId) && !linkedEntity, recurrenceGenerated: row.recurrenceGenerated, invalidDate,
    occurrence: invalidDate || row.recurrenceGenerated ? { nextDate: null, skippedMonths: [], limited: false } : nextTaskOccurrence(dueDate, row.recurrence) };
}
async function successor(tx: Tx, id: string) {
  return tx.task.findFirst({ where: { ownerId: live.ownerId, generationKey: key(id) } });
}
function successorDto(row: Task | null): TaskSuccessor | null {
  return row ? { id: row.id, name: row.name, dueDate: date(row.dueDate), status: row.status, deleted: row.deletedAt !== null } : null;
}
async function detail(tx: Tx, row: Task): Promise<TaskDetail> {
  const next = await successor(tx, row.id);
  return { ...await dto(tx, row), successor: successorDto(next), successorMissing: row.recurrenceGenerated && !next };
}
async function complete(tx: Tx, id: string, version: number): Promise<TaskActionResult> {
  const before = await requireTask(tx, id);
  if (before.version !== version || before.status !== 'OPEN') throw new AppError('STALE_VERSION', 409);
  let next = await successor(tx, id); const reused = before.recurrenceGenerated || next !== null;
  let consumed = reused; let created = false; const batchId = randomUUID();
  if (!consumed && before.recurrence !== 'NONE') {
    requireExampleName(before.isExample, before.name);
    const occurrence = nextTaskOccurrence(date(before.dueDate), before.recurrence);
    if (!occurrence.nextDate) throw new AppError('RECURRENCE_LIMIT', 409);
    // A new occurrence cannot inherit an unavailable historical reference.
    await requireTaskLink(tx, before.entityType, before.entityId);
    const data = { name: before.name, priority: before.priority, dueDate: new Date(occurrence.nextDate), recurrence: before.recurrence, entityType: before.entityType, entityId: before.entityId };
    next = await tx.task.create({ data: { ...data, status: 'OPEN', isExample: before.isExample, generationKey: key(id), recurrenceGenerated: false, fieldProvenance: provenanceFor(data) } });
    consumed = true; created = true;
  }
  const changed = await tx.task.updateMany({ where: { ...live, id, version, status: 'OPEN' },
    data: { status: 'DONE', recurrenceGenerated: consumed, version: { increment: 1 }, fieldProvenance: provenanceFor({ status: 'DONE' }, before.fieldProvenance) } });
  if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
  await logEvent(tx, { entityType: 'Task', entityId: id, name: before.name, action: 'update', isExample: before.isExample, batchId,
    diffs: { old: { status: before.status }, new: { status: 'DONE' } } });
  if (created && next) await logEvent(tx, { entityType: 'Task', entityId: next.id, name: next.name, action: 'create', isExample: next.isExample, batchId,
    diffs: { new: { ...audit(next), repeatedFrom: id } } });
  return { task: await detail(tx, await requireTask(tx, id)), reused };
}

export async function createTaskRecord(tx: Tx, input: TaskInput, context: { id?: string; isExample?: boolean; batchId?: string; generationKey?: string } = {}) {
  await requireTaskLink(tx, input.linkedEntity?.type ?? null, input.linkedEntity?.id ?? null);
  requireExampleName(context.isExample ?? false, input.name);
  const data = fields(input);
  const row = await tx.task.create({ data: { ...data, id: context.id, isExample: context.isExample ?? false, generationKey: context.generationKey, name: input.name, dueDate: new Date(input.dueDate), fieldProvenance: provenanceFor(data) } });
  await logEvent(tx, { entityType: 'Task', entityId: row.id, name: row.name, action: 'create', isExample: row.isExample, batchId: context.batchId, diffs: { new: audit(row) } });
  return row;
}
export async function registerTasks(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/tasks/links', async req => {
    const { type, q, page } = taskLinkQuery.parse(req.query);
    return db.$transaction(async tx => {
      const term = normalizeSearch(q); const rows = (await taskLinkRecords(tx, type)).filter(row => normalizeSearch(row.name).includes(term));
      return { items: rows.slice((page - 1) * 50, page * 50), total: rows.length, page, pageSize: 50 };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/tasks', async req => {
    const { page, q, status, due } = taskQuery.parse(req.query); const today = new Date(istanbulToday());
    return db.$transaction(async tx => {
      const candidates = await tx.task.findMany({ where: { ...live, ...(status === 'all' ? {} : { status }),
        ...(due === 'all' ? {} : { dueDate: due === 'today' ? today : due === 'overdue' ? { lt: today } : { gt: today } }) },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] });
      const term = normalizeSearch(q); const rows = candidates.filter(row => normalizeSearch(row.name).includes(term));
      const items = []; for (const row of rows.slice((page - 1) * 50, page * 50)) items.push(await dto(tx, row));
      return { items, total: rows.length, page, pageSize: 50, today: date(today) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/tasks/:id', async req => db.$transaction(async tx => detail(tx, await requireTask(tx, idParams.parse(req.params).id)), { isolationLevel: 'RepeatableRead' }));
  app.get('/api/tasks/:id/timeline', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      await requireTask(tx, id);
      return tx.timelineEvent.findMany({ where: { ...live, entityType: 'Task', entityId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
        select: { id: true, action: true, actor: true, createdAt: true, summaryTr: true, summaryEn: true, diffs: true, batchId: true } });
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/tasks', async (req, reply) => {
    const input = taskCreate.parse(req.body);
    const saved = await db.$transaction(async tx => {
      const row = await createTaskRecord(tx, input);
      return detail(tx, row);
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(saved);
  });
  app.patch('/api/tasks/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, changes } = taskPatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireTask(tx, id); if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      if (changes.name !== undefined) requireExampleName(before.isExample, changes.name);
      if (changes.linkedEntity !== undefined) await requireTaskLink(tx, changes.linkedEntity?.type ?? null, changes.linkedEntity?.id ?? null);
      const data = fields(changes);
      const updated = await tx.task.updateMany({ where: { ...live, id, version }, data: { ...data, version: { increment: 1 }, fieldProvenance: provenanceFor(data, before.fieldProvenance) } });
      if (updated.count !== 1) throw new AppError('STALE_VERSION', 409);
      const row = await requireTask(tx, id);
      const oldFields = audit(before); const newFields = audit(row); const keys = Object.keys(data) as (keyof typeof oldFields)[];
      await logEvent(tx, { entityType: 'Task', entityId: id, name: row.name, action: 'update', isExample: row.isExample,
        diffs: { old: Object.fromEntries(keys.map(key => [key, oldFields[key]])), new: Object.fromEntries(keys.map(key => [key, newFields[key]])) } });
      return detail(tx, row);
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/tasks/:id/complete', async req => db.$transaction(tx => complete(tx, idParams.parse(req.params).id, versionInput.parse(req.body).version), { isolationLevel: 'Serializable' }));
  app.post('/api/tasks/:id/reopen', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireTask(tx, id);
      if (before.version !== version || before.status !== 'DONE') throw new AppError('STALE_VERSION', 409);
      const updated = await tx.task.updateMany({ where: { ...live, id, version, status: 'DONE' }, data: { status: 'OPEN', version: { increment: 1 }, fieldProvenance: provenanceFor({ status: 'OPEN' }, before.fieldProvenance) } });
      if (updated.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'Task', entityId: id, name: before.name, action: 'update', isExample: before.isExample, diffs: { old: { status: 'DONE' }, new: { status: 'OPEN' } } });
      return detail(tx, await requireTask(tx, id));
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/tasks/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireTask(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { retentionDays: true } });
      const days = retentionPeriods.parse(settings?.retentionDays ?? {}).Task ?? 30; const now = new Date();
      if ((await tx.task.updateMany({ where: { ...live, id, version }, data: { deletedAt: now, version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      await tx.trashEntry.create({ data: { entityType: 'Task', entityId: id, label: row.name, isExample: row.isExample, expiresAt: new Date(now.getTime() + days * 86400_000) } });
      await logEvent(tx, { entityType: 'Task', entityId: id, name: row.name, action: 'delete', isExample: row.isExample, diffs: { old: { deletedAt: null }, new: { deletedAt: now.toISOString() } } });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
}
