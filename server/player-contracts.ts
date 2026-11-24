import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, type Contract, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ageOn, isoDate, istanbulToday, normalizeSearch } from '../shared/domain.js';
import { contractDeadlines, contractFields, contractInput, contractListQuery, contractNote, contractNoteParams, contractNotePatch, contractPatch, contractReveal, contractThresholds, defaultContractThresholds, type ContractInput } from '../shared/player-contracts.js';
import { idParams, versionInput } from '../shared/contracts.js';
import { retentionPeriods } from '../shared/retention.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { decrypt, encrypt } from './crypto.js';
import { contractScope, requireContract } from './contract-parent.js';
import { contractCatchupDays, contractReminderPrefix, currentContractNotificationKeys, refreshContractReminders } from './contract-reminders.js';
import { provenanceFor } from '../shared/provenance.js';
import { isPrivateSourceUrl } from '../shared/private-links.js';
import { contractDocumentLink, contractSourceEvidence, contractSourceUrl, protectedContractEvidence } from './contract-evidence.js';

const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const named = { id: true, name: true } as const;
const peers = { player: { select: { ...named, status: true } }, club: { select: named }, agent: { select: named } } as const;
const jsonKeys = {
  releaseClause: ['amount', 'currency', 'validFrom', 'validTo', 'conditions', 'met'],
  buyout: ['amount', 'currency', 'validFrom', 'validTo', 'conditions', 'met'],
  extensionOption: ['deadline', 'terms'], representation: ['scope', 'startDate', 'endDate', 'commissionRate', 'paymentTerms'],
} as const;
const dateKeys = new Set(['signedDate', 'startDate', 'endDate', 'noticeDeadline', 'sourceDate']);
const privateAudit = new Set(['salaryAmount', 'bonuses', ...Object.keys(jsonKeys), 'methodNote', 'documentLink']);
function projectedTerms(value: Prisma.JsonValue | null, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(keys.filter(key => key in value && (value[key] === null || typeof value[key] === 'string')).map(key => [key, value[key]]));
}
function asDates(row: Contract) {
  return { ...row, startDate: date(row.startDate)!, endDate: date(row.endDate)!, noticeDeadline: date(row.noticeDeadline) };
}
async function thresholds(tx: Tx) {
  const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { notificationThresholds: true } });
  return contractThresholds.parse(settings?.notificationThresholds ?? [...defaultContractThresholds]);
}
function dto(row: Contract & Prisma.ContractGetPayload<{ include: typeof peers }>, limits: number[]) {
  return {
    id: row.id, version: row.version, name: row.name, type: row.type, playerId: row.playerId, player: row.player,
    clubId: row.clubId, club: row.club, agentId: row.agentId, agent: row.agent,
    signedDate: date(row.signedDate), startDate: date(row.startDate)!, endDate: date(row.endDate)!, isActive: row.isActive,
    salaryAmount: row.salaryAmount ? '***' : null, salaryCurrency: row.salaryCurrency, salaryPeriod: row.salaryPeriod,
    salaryBasis: row.salaryBasis, bonuses: row.bonuses ? '***' : null, paymentDay: row.paymentDay,
    releaseClause: projectedTerms(row.releaseClause, jsonKeys.releaseClause), buyout: projectedTerms(row.buyout, jsonKeys.buyout),
    extensionOption: projectedTerms(row.extensionOption, jsonKeys.extensionOption), representation: projectedTerms(row.representation, jsonKeys.representation),
    noticeDeadline: date(row.noticeDeadline), documentLink: null, hasDocumentLink: !!(row.privateDocumentLink || row.documentLink),
    sourceUrl: isPrivateSourceUrl(row.sourceUrl) ? null : row.sourceUrl, hasPrivateSource: !!(contractSourceEvidence(row).sourceUrl || isPrivateSourceUrl(row.sourceUrl)), sourceDate: date(row.sourceDate), methodNote: row.methodNote,
    legacyGroups: (Object.keys(jsonKeys) as (keyof typeof jsonKeys)[]).filter(key => row[key] !== null && !contractFields.shape[key].safeParse(row[key]).success),
    dates: contractDeadlines(asDates(row), istanbulToday(), limits),
  };
}
async function counterpart(tx: Tx, clubId: string | null, agentId: string | null) {
  if (clubId && agentId) throw new AppError('INVALID_INPUT');
  if (clubId) await requireEntity(tx, 'Club', clubId);
  if (agentId && !await tx.agent.findFirst({ where: { ...live, id: agentId }, select: { id: true } })) throw new AppError('NOT_FOUND', 404);
}
function changedData(changes: Partial<ContractInput>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (dateKeys.has(key)) result[key] = value === null ? null : new Date(value as string);
    else if (key === 'salaryAmount' || key === 'bonuses') result[key] = value === null ? null : encrypt(value as string, `Contract.${key}`);
    else if (key in jsonKeys) result[key] = value === null ? Prisma.DbNull : value;
    else if (key !== 'documentLink' && key !== 'sourceUrl') result[key] = value;
  }
  return result;
}
function auditValues(changes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, privateAudit.has(key) ? '***' : value]));
}
async function history(tx: Tx, row: Contract, action: string, changes: Record<string, unknown>, before?: Contract) {
  const batchId = randomUUID();
  const old = before ? auditValues(Object.fromEntries(Object.keys(changes).map(key => {
    const value = before[key as keyof Contract]; return [key, value instanceof Date ? dateKeys.has(key) ? date(value) : value.toISOString() : value ?? null];
  }))) : null;
  for (const [entityType, entityId] of [['Contract', row.id], ['Player', row.playerId]] as const) {
    await logEvent(tx, { entityType, entityId, name: row.name, action, batchId, isExample: row.isExample, diffs: { contractId: row.id, fieldsChanged: Object.keys(changes), old, new: auditValues(changes) } });
  }
}
async function trash(tx: Tx, type: 'Contract' | 'Note', row: { id: string; isExample: boolean }, name: string) {
  const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { retentionDays: true } });
  const days = retentionPeriods.parse(settings?.retentionDays ?? {})[type] ?? 30;
  await tx.trashEntry.create({ data: { entityType: type, entityId: row.id, label: name, isExample: row.isExample, expiresAt: new Date(Date.now() + days * 86400_000) } });
}
function validateChanges(before: Contract, changes: Partial<ContractInput>) {
  const start = changes.startDate ?? date(before.startDate)!; const end = changes.endDate ?? date(before.endDate)!;
  if (('startDate' in changes || 'endDate' in changes) && start > end) throw new AppError('INVALID_INPUT');
  if (['salaryAmount', 'salaryCurrency', 'salaryBasis', 'salaryPeriod'].some(key => key in changes)) {
    const amount = changes.salaryAmount === undefined ? before.salaryAmount : changes.salaryAmount;
    if (amount !== null && ['salaryCurrency', 'salaryBasis', 'salaryPeriod'].some(key =>
      (changes as Record<string, unknown>)[key] === undefined ? !before[key as keyof Contract] : !(changes as Record<string, unknown>)[key])) throw new AppError('INVALID_INPUT');
  }
}

export async function registerContracts(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/contracts/reminders', async () => ({ created: await refreshContractReminders(db), catchupDays: contractCatchupDays }));
  app.get('/api/contracts/reminders', async req => {
    const { page } = contractListQuery.parse(req.query);
    return db.$transaction(async tx => {
      const parents = await tx.contract.findMany({ where: { ...contractScope, isActive: true }, select: { id: true, name: true } });
      const names = new Map(parents.map(row => [row.id, row.name]));
      const current = await currentContractNotificationKeys(tx);
      const rows = await tx.notification.findMany({ where: { ...live, entityType: 'Contract', entityId: { in: [...names.keys()] }, dedupeKey: { in: current }, type: { startsWith: contractReminderPrefix } },
        select: { id: true, entityId: true, type: true, targetDate: true, thresholdDays: true, status: true }, orderBy: [{ targetDate: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 51 });
      return { items: rows.slice(0, 50).map(row => ({ ...row, name: names.get(row.entityId)! })), more: rows.length > 50, catchupDays: contractCatchupDays };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/contracts', async req => {
    const { page, q, playerId, active } = contractListQuery.parse(req.query);
    return db.$transaction(async tx => {
      const rows = await tx.contract.findMany({ where: { ...contractScope, playerId, isActive: active === undefined ? undefined : active === 'true' },
        select: { id: true, version: true, name: true, type: true, startDate: true, endDate: true, isActive: true, ...peers }, orderBy: [{ endDate: 'asc' }, { id: 'asc' }] });
      const query = normalizeSearch(q);
      const items = query ? rows.filter(row => normalizeSearch(`${row.name} ${row.player.name} ${row.club?.name ?? ''} ${row.agent?.name ?? ''}`).includes(query)) : rows;
      return { items: items.slice((page - 1) * 50, page * 50), total: items.length };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/contracts/:id', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const row = await tx.contract.findFirst({ where: { ...contractScope, id }, include: peers });
      if (!row) throw new AppError('NOT_FOUND', 404);
      return dto(row, await thresholds(tx));
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/players/:id/contracts', async (req, reply) => {
    const { id } = idParams.parse(req.params); const input = contractInput.parse(req.body);
    const result = await db.$transaction(async tx => {
      const player = await tx.player.findFirst({ where: { ...live, id, status: { in: ['OWN', 'INTERMEDIARY'] } } });
      if (!player) throw new AppError('CONTRACT_PLAYER_REQUIRED');
      await counterpart(tx, input.clubId, input.agentId);
      const row = await tx.contract.create({ data: { ...changedData(input), ...protectedContractEvidence(input), playerId: id, isExample: player.isExample } as Prisma.ContractUncheckedCreateInput });
      await history(tx, row, 'create', input); return { id: row.id, version: row.version };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(result);
  });
  app.patch('/api/contracts/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, changes } = contractPatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireContract(tx, id);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      validateChanges(before, changes);
      await counterpart(tx, changes.clubId === undefined ? before.clubId : changes.clubId, changes.agentId === undefined ? before.agentId : changes.agentId);
      const row = await tx.contract.update({ where: { ...live, id, version }, data: { ...changedData(changes), ...protectedContractEvidence(changes, before), version: { increment: 1 } } });
      await history(tx, row, 'update', changes, before); return { id, version: row.version };
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/contracts/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireContract(tx, id);
      const row = await tx.contract.update({ where: { ...live, id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await trash(tx, 'Contract', row, before.name); await history(tx, row, 'delete', { deletedAt: row.deletedAt!.toISOString() }, before); return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/contracts/:id/reveal', async req => {
    const { id } = idParams.parse(req.params); const { field, version } = contractReveal.parse(req.body);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    return db.$transaction(async tx => {
      const row = await requireContract(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      if (field === 'documentLink' || field === 'sourceUrl') {
        const value = field === 'documentLink' ? contractDocumentLink(row) : contractSourceUrl(row);
        await tx.auditLog.create({ data: { entityType: 'Contract', entityId: id, actor: 'owner', action: 'reveal', diffs: { field }, isExample: row.isExample } });
        return { field, value, expiresIn: 60, expiresAt };
      }
      if (field !== 'compliance') {
        await tx.auditLog.create({ data: { entityType: 'Contract', entityId: id, actor: 'owner', action: 'reveal', diffs: { field }, isExample: row.isExample } });
        return { field, value: row[field] ? decrypt(row[field]!, `Contract.${field}`) : null, expiresIn: 60, expiresAt };
      }
      const player = await tx.player.findFirstOrThrow({ where: { ...live, id: row.playerId }, select: { birthDate: true } });
      await tx.auditLog.create({ data: { entityType: 'Player', entityId: row.playerId, actor: 'owner', action: 'reveal', diffs: { field: 'birthDate' }, isExample: row.isExample } });
      const birth = player.birthDate ? decrypt(player.birthDate, 'Player.birthDate') : null;
      const minor = birth && isoDate.safeParse(birth).success && birth <= istanbulToday() ? ageOn(birth) < 18 : null;
      const rules = z.object({ status: z.string(), entries: z.array(z.object({ id: z.string(), text: z.object({ tr: z.string(), en: z.string() }), appliesWhen: z.string(), version: z.string(), reviewedAt: z.string() })) }).parse(JSON.parse(await readFile(resolve('config/compliance/minors.json'), 'utf8')));
      return { field, minor, status: rules.status, checkpoints: minor ? rules.entries.filter(entry => entry.appliesWhen === 'player.age < 18') : [], expiresIn: 60, expiresAt };
    });
  });
  app.get('/api/contracts/:id/timeline', async req => {
    const { id } = idParams.parse(req.params); await requireContract(db, id);
    return db.timelineEvent.findMany({ where: { ...live, entityType: 'Contract', entityId: id }, select: { id: true, summaryTr: true, summaryEn: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100 });
  });
  app.get('/api/contracts/:id/notes', async req => {
    const { id } = idParams.parse(req.params); await requireContract(db, id);
    return db.note.findMany({ where: { ...live, entityType: 'Contract', entityId: id }, select: { id: true, text: true, version: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100 });
  });
  app.post('/api/contracts/:id/notes', async (req, reply) => {
    const { id } = idParams.parse(req.params); const input = contractNote.parse(req.body);
    const row = await db.$transaction(async tx => {
      const parent = await requireContract(tx, id);
      const note = await tx.note.create({ data: { ...input, entityType: 'Contract', entityId: id, isExample: parent.isExample, fieldProvenance: provenanceFor(input) } });
      await logEvent(tx, { entityType: 'Note', entityId: note.id, name: parent.name, action: 'create', diffs: { old: null, new: { text: '***' } }, isExample: note.isExample });
      await history(tx, parent, 'update', { noteId: note.id, text: '***' }); return { id: note.id, version: note.version };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });
  for (const method of ['patch', 'delete'] as const) app[method]('/api/contracts/:id/notes/:noteId', async req => {
    const { id, noteId } = contractNoteParams.parse(req.params);
    const input = method === 'patch' ? contractNotePatch.parse(req.body) : versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const parent = await requireContract(tx, id);
      const before = await tx.note.findFirst({ where: { ...live, id: noteId, entityType: 'Contract', entityId: id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const row = await tx.note.update({ where: { ...live, id: noteId, entityType: 'Contract', entityId: id, version: input.version }, data: {
        ...('text' in input && typeof input.text === 'string' ? { text: input.text, fieldProvenance: provenanceFor({ text: input.text }, before.fieldProvenance) } : { deletedAt: new Date() }), version: { increment: 1 },
      } });
      if (method === 'delete') await trash(tx, 'Note', row, parent.name);
      await logEvent(tx, { entityType: 'Note', entityId: row.id, name: parent.name, action: method === 'patch' ? 'update' : 'delete', diffs: { old: { text: '***' }, new: { text: '***' } }, isExample: row.isExample });
      await history(tx, parent, 'update', { noteId, text: '***' }); return { id: row.id, version: row.version };
    }, { isolationLevel: 'Serializable' });
  });
}
