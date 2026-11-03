import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { maskSensitive, type entityTypes } from '../shared/domain.js';
import { tr, en } from '../shared/locales.js';
import { z } from 'zod';

export type EntityType = typeof entityTypes[number];
export type Tx = Prisma.TransactionClient;
export const live = { ownerId: 'owner', deletedAt: null };
export class AppError extends Error { constructor(public code: string, public status = 400) { super(code); } }
export function delegate(db: Tx, type: EntityType) {
  // Common operations have the same primary-key/owner/soft-delete contract.
  if (type === 'Club') return db.club;
  if (type === 'Player') return db.player;
  if (type === 'Person') return db.person;
  return db.request;
}
export async function requireEntity(tx: Tx, type: EntityType, id: string) {
  const query = { where: { ...live, id } };
  const row = type === 'Club' ? await tx.club.findFirst(query) : type === 'Player' ? await tx.player.findFirst(query) : type === 'Person' ? await tx.person.findFirst(query) : await tx.request.findFirst(query);
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
export async function logEvent(tx: Tx, input: { entityType: string; entityId: string; action: string; name: string; diffs?: unknown; isExample?: boolean; batchId?: string; summaries?: { tr: string; en: string } }) {
  const key = `timeline_${input.action}` as keyof typeof tr;
  const diffs = maskSensitive(input.diffs ?? {}) as Prisma.InputJsonValue;
  const event = await tx.timelineEvent.create({ data: { actor: 'owner', entityType: input.entityType, entityId: input.entityId, action: input.action, batchId: input.batchId ?? randomUUID(), summaryTr: input.summaries?.tr ?? (tr[key] || tr.timeline_update).replace('{name}', input.name), summaryEn: input.summaries?.en ?? (en[key] || en.timeline_update).replace('{name}', input.name), diffs, isExample: input.isExample ?? false } });
  await tx.auditLog.create({ data: { actor: 'owner', action: input.action, entityType: input.entityType, entityId: input.entityId, diffs, isExample: input.isExample ?? false } });
  return event;
}
export async function softDelete(db: PrismaClient, type: EntityType, id: string, version: number) {
  return db.$transaction(async tx => {
    const row = await requireEntity(tx, type, id);
    if (row.version !== version) throw new AppError('STALE_VERSION', 409);
    const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
    const retention = z.record(z.string(), z.number().int().min(1).max(3650)).parse(settings?.retentionDays ?? {});
    const data = { deletedAt: new Date(), version: { increment: 1 } }; const where = { ...live, id, version };
    const changed = type === 'Club' ? await tx.club.updateMany({ where, data }) : type === 'Player' ? await tx.player.updateMany({ where, data }) : type === 'Person' ? await tx.person.updateMany({ where, data }) : await tx.request.updateMany({ where, data });
    if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
    await tx.trashEntry.create({ data: { entityType: type, entityId: id, label: row.name, expiresAt: new Date(Date.now() + (retention[type] ?? 30) * 86400_000), isExample: row.isExample } });
    await logEvent(tx, { entityType: type, entityId: id, action: 'delete', name: row.name, isExample: row.isExample });
  });
}
