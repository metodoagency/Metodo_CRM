import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { presentationRuleInput, presentationRulePreview, type PresentationRulePreview } from '../shared/presentation-tasks.js';
import { tr, en } from '../shared/locales.js';
import { taskDate, taskFields } from '../shared/tasks.js';
import { AppError, logEvent, type Tx } from './core.js';
import { keyring } from './crypto.js';
import { hash, sessionCookie } from './auth.js';
import { presentationLive } from './presentation-parent.js';
import { createTaskRecord } from './tasks.js';
import { isCommitWriteConflict } from './runtime-adapter.js';
import { ensureUserSettings } from './user-settings.js';

const ruleKey = 'presentation-follow-up-v1';
const eligible = { ...presentationLive, result: { not: 'REJECTED' as const } };
// The adapter can materialize historical BC values as Invalid Date. Never let one legacy row abort a batch.
const day = (date: Date) => Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : 'INVALID_DATE';
const settings = ensureUserSettings;
function sign(session: string, payload: Omit<PresentationRulePreview, 'previewToken'>) {
  return createHmac('sha256', Buffer.from(keyring().blind, 'base64')).update('PresentationRulePreview:v1:').update(session).update(JSON.stringify(payload)).digest('hex');
}
async function sources(tx: Tx, ids: string[]) {
  const rows = await tx.presentation.findMany({ where: { ...eligible, id: { in: ids } }, orderBy: { id: 'asc' }, include: { club: true, person: true, player: true, request: true } });
  const receipts = await tx.taskGenerationReceipt.findMany({ where: { ownerId: 'owner', ruleKey, entityType: 'Presentation', entityId: { in: ids } }, orderBy: [{ entityId: 'asc' }, { targetDate: 'asc' }] });
  // Bind all linked parent versions as well as source fields. No private values leave this digest.
  const digest = createHash('sha256').update(JSON.stringify({ ids, rows: rows.map(row => ({ id: row.id, version: row.version, date: day(row.followUpDate), result: row.result, isExample: row.isExample, parents: [row.club, row.person, row.player, row.request].map(parent => parent ? { id: parent.id, version: parent.version, isExample: parent.isExample } : null) })), receipts })).digest('hex');
  return { rows, receipts, digest };
}
function taskDraft(row: { id: string; isExample: boolean; followUpDate: Date }) {
  return taskFields.parse({ name: `${row.isExample ? 'Örnek ' : ''}${tr.presentationTaskGenerated}`, priority: 'MEDIUM', dueDate: day(row.followUpDate), recurrence: 'NONE', linkedEntity: { type: 'Presentation', id: row.id } });
}
async function insertOccurrence(tx: Tx, source: { id: string; version: number; name: string; isExample: boolean; followUpDate: Date }, ruleVersion: number, batchId: string, taskId: string = randomUUID()) {
  const consumed = await tx.taskGenerationReceipt.findFirst({ where: { ownerId: 'owner', ruleKey, entityType: 'Presentation', entityId: source.id, targetDate: source.followUpDate } });
  if (consumed) return false;
  await createTaskRecord(tx, taskDraft(source), { id: taskId, isExample: source.isExample, batchId });
  await tx.taskGenerationReceipt.create({ data: { name: `${source.isExample ? 'Örnek ' : ''}Presentation follow-up receipt`, ruleKey, entityType: 'Presentation', entityId: source.id, targetDate: source.followUpDate, taskId, sourceVersion: source.version, ruleVersion, isExample: source.isExample } });
  await logEvent(tx, { entityType: 'Presentation', entityId: source.id, name: source.name, action: 'update', batchId, isExample: source.isExample, diffs: { generatedTaskId: taskId, ruleKey, ruleVersion, followUpDate: day(source.followUpDate) }, summaries: { tr: tr.presentationTaskGenerated, en: en.presentationTaskGenerated } });
  return true;
}
// Called inside the source's transaction. Existing edited/completed/trashed Tasks are never updated.
export async function generatePresentationTask(tx: Tx, id: string, batchId = randomUUID()) {
  const rule = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
  if (!rule?.presentationFollowUpTasksEnabled || !rule.presentationTaskRuleSince) return false;
  // A concurrent disable either precedes this read or conflicts with this serializable transaction.
  const source = await tx.presentation.findFirst({ where: { ...eligible, id } });
  if (!source || !taskDate.safeParse(day(source.followUpDate)).success) return false;
  const enrolled = await tx.taskGenerationReceipt.count({ where: { ownerId: 'owner', ruleKey, entityType: 'Presentation', entityId: id } });
  if (source.createdAt < rule.presentationTaskRuleSince && !enrolled) return false;
  return insertOccurrence(tx, source, rule.presentationTaskRuleVersion, batchId);
}
export async function catchUpPresentationTasks(db: PrismaClient) {
  // Stored records only; no network acquisition. Each bounded occurrence has its own atomic receipt.
  const rule = await db.userSettings.findUnique({ where: { ownerId: 'owner' } });
  if (!rule?.presentationFollowUpTasksEnabled || !rule.presentationTaskRuleSince) return { created: 0 };
  let cursor: string | undefined; let created = 0;
  for (;;) {
    const rows = await db.presentation.findMany({ where: { ...eligible, createdAt: { gte: rule.presentationTaskRuleSince } }, select: { id: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const row of rows) {
      try { if (await db.$transaction(tx => generatePresentationTask(tx, row.id), { isolationLevel: 'Serializable' })) created++; }
      catch (error) { if (!isCommitWriteConflict(error) && !(error && typeof error === 'object' && 'code' in error && ['P2002', 'P2034'].includes(String(error.code)))) throw error; }
    }
    if (rows.length < 100) break;
    cursor = rows[rows.length - 1].id;
  }
  return { created };
}
export async function registerPresentationTasks(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/task-rules/presentation', async () => {
    const row = await settings(db);
    return { version: row.version, ruleVersion: row.presentationTaskRuleVersion, enabled: row.presentationFollowUpTasksEnabled, since: row.presentationTaskRuleSince?.toISOString() ?? null };
  });
  app.get('/api/task-rules/presentation/candidates', async req => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict().parse(req.query);
    return db.$transaction(async tx => {
      const rows = await tx.presentation.findMany({ where: eligible, orderBy: [{ followUpDate: 'asc' }, { id: 'asc' }], take: 50, skip: (page - 1) * 50 });
      const receipts = await tx.taskGenerationReceipt.findMany({ where: { ownerId: 'owner', ruleKey, entityType: 'Presentation', entityId: { in: rows.map(row => row.id) } } });
      return { items: rows.map(row => ({ id: row.id, name: row.name, followUpDate: day(row.followUpDate), invalidDate: !taskDate.safeParse(day(row.followUpDate)).success, consumed: receipts.some(receipt => receipt.entityId === row.id && day(receipt.targetDate) === day(row.followUpDate)) })), total: await tx.presentation.count({ where: eligible }) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/task-rules/presentation/preview', async req => {
    const input = presentationRuleInput.parse(req.body);
    return db.$transaction(async tx => {
      const rule = await settings(tx);
      if (rule.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const sourceIds = [...input.sourceIds].sort(); const source = await sources(tx, sourceIds);
      const tasks: PresentationRulePreview['tasks'] = []; const skipped: PresentationRulePreview['skipped'] = [];
      for (const id of sourceIds) {
        const row = source.rows.find(item => item.id === id);
        if (!row) skipped.push({ sourceId: id, reason: 'UNAVAILABLE' });
        else if (!taskDate.safeParse(day(row.followUpDate)).success) skipped.push({ sourceId: id, reason: 'INVALID_DATE' });
        else if (source.receipts.some(receipt => receipt.entityId === id && day(receipt.targetDate) === day(row.followUpDate))) skipped.push({ sourceId: id, reason: 'CONSUMED' });
        else tasks.push({ id: randomUUID(), sourceId: id, sourceName: row.name, isExample: row.isExample, input: taskDraft(row) });
      }
      const payload = { ownerId: 'owner' as const, version: rule.version, ruleVersion: rule.presentationTaskRuleVersion, beforeEnabled: rule.presentationFollowUpTasksEnabled, enabled: input.enabled, sourceIds, sourceDigest: source.digest, expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), nonce: randomUUID(), tasks, skipped };
      return { ...payload, previewToken: sign(hash(req.cookies[sessionCookie]!), payload) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/task-rules/presentation/confirm', async req => {
    const { previewToken, ...input } = presentationRulePreview.parse(req.body);
    const expected = sign(hash(req.cookies[sessionCookie]!), input);
    if (!timingSafeEqual(Buffer.from(previewToken, 'hex'), Buffer.from(expected, 'hex'))) throw new AppError('STALE_PREVIEW', 409);
    return db.$transaction(async tx => {
      if (Date.parse(input.expiresAt) <= Date.now()) throw new AppError('STALE_PREVIEW', 409);
      const rule = await settings(tx);
      if (rule.version !== input.version || rule.presentationTaskRuleVersion !== input.ruleVersion || rule.presentationFollowUpTasksEnabled !== input.beforeEnabled) throw new AppError('STALE_VERSION', 409);
      const source = await sources(tx, input.sourceIds);
      if (source.digest !== input.sourceDigest) throw new AppError('STALE_PREVIEW', 409);
      const changed = input.enabled !== input.beforeEnabled; const ruleVersion = input.ruleVersion + Number(changed); const batchId = randomUUID();
      for (const draft of input.tasks) {
        const row = source.rows.find(row => row.id === draft.sourceId);
        if (!input.enabled || !row || JSON.stringify(taskDraft(row)) !== JSON.stringify(draft.input)) throw new AppError('STALE_PREVIEW', 409);
        if (!await insertOccurrence(tx, row, ruleVersion, batchId, draft.id)) throw new AppError('STALE_PREVIEW', 409);
      }
      if (!changed && !input.tasks.length) throw new AppError('EMPTY_PATCH');
      await tx.userSettings.update({ where: { ownerId: 'owner', version: input.version, presentationTaskRuleVersion: input.ruleVersion }, data: { version: { increment: 1 }, presentationFollowUpTasksEnabled: input.enabled, presentationTaskRuleVersion: ruleVersion, ...(changed && input.enabled ? { presentationTaskRuleSince: new Date() } : {}) } });
      await logEvent(tx, { entityType: 'Owner', entityId: 'owner', name: ruleKey, action: 'update', batchId, diffs: { old: { enabled: input.beforeEnabled, ruleVersion: input.ruleVersion }, new: { enabled: input.enabled, ruleVersion }, taskIds: input.tasks.map(task => task.id) } });
      return { ok: true, created: input.tasks.length };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  });
}
