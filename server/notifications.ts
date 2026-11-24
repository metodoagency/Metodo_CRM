import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { effectiveNotificationState, notificationAction, notificationQuery, notificationTransition, type NotificationList } from '../shared/notifications.js';
import { idParams } from '../shared/contracts.js';
import { tr, en } from '../shared/locales.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { contractReminderPrefix, currentContractNotificationKeys } from './contract-reminders.js';

// This first center adapter handles contract deadlines only. Birthday occurrences
// stay behind the calendar's explicit, audited, temporary sensitive-field view.
export async function currentNotificationScope(tx: Tx): Promise<Prisma.NotificationWhereInput> {
  return { ...live, entityType: 'Contract', type: { startsWith: contractReminderPrefix },
    dedupeKey: { in: await currentContractNotificationKeys(tx) } };
}
export function notificationStateWhere(view: 'unread' | 'snoozed' | 'read' | 'all', now: Date): Prisma.NotificationWhereInput {
  if (view === 'all') return {};
  if (view === 'read') return { status: 'READ' };
  if (view === 'snoozed') return { status: 'SNOOZED', snoozedUntil: { gt: now } };
  return { OR: [{ status: 'NEW' }, { status: 'SNOOZED', OR: [{ snoozedUntil: { lte: now } }, { snoozedUntil: null }] }] };
}
export async function unreadNotificationCount(tx: Tx, now = new Date()) {
  return tx.notification.count({ where: { AND: [await currentNotificationScope(tx), notificationStateWhere('unread', now)] } });
}
export async function listNotifications(tx: Tx, query: ReturnType<typeof notificationQuery.parse>, now = new Date()): Promise<NotificationList> {
  const scope = await currentNotificationScope(tx); const pageSize = 50;
  const where = { AND: [scope, notificationStateWhere(query.view, now)] };
  const [rows, total, unread] = await Promise.all([
    tx.notification.findMany({ where, orderBy: [{ targetDate: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * pageSize, take: pageSize,
      select: { id: true, version: true, type: true, entityId: true, targetDate: true, thresholdDays: true, status: true, snoozedUntil: true } }),
    tx.notification.count({ where }), tx.notification.count({ where: { AND: [scope, notificationStateWhere('unread', now)] } }),
  ]);
  const contracts = await tx.contract.findMany({ where: { ...live, id: { in: rows.map(row => row.entityId) } }, select: { id: true, name: true } });
  const names = new Map(contracts.map(row => [row.id, row.name]));
  return { items: rows.map(row => ({ ...row, entityType: 'Contract', name: names.get(row.entityId)!,
    targetDate: row.targetDate.toISOString().slice(0, 10), status: effectiveNotificationState(row, now), snoozedUntil: row.snoozedUntil?.toISOString() ?? null })),
  total, unread, page: query.page, pageSize, now: now.toISOString() };
}
export async function registerNotifications(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/notifications', async req => db.$transaction(tx => listNotifications(tx, notificationQuery.parse(req.query)), { isolationLevel: 'RepeatableRead' }));
  app.patch('/api/notifications/:id', async req => {
    const { id } = idParams.parse(req.params); const input = notificationAction.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.notification.findFirst({ where: { AND: [await currentNotificationScope(tx), { id }] } });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const now = new Date(); const data = notificationTransition(input.action, now);
      const saved = await tx.notification.updateMany({ where: { ...live, id, version: input.version }, data: { ...data, version: { increment: 1 } } });
      if (saved.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'Notification', entityId: id, name: tr.notificationCenter, action: 'update', isExample: row.isExample,
        summaries: { tr: tr.notificationTimeline, en: en.notificationTimeline },
        diffs: { old: { status: row.status, snoozedUntil: row.snoozedUntil?.toISOString() ?? null }, new: { status: data.status, snoozedUntil: data.snoozedUntil?.toISOString() ?? null } } });
      return { id, version: input.version + 1, ...data };
    }, { isolationLevel: 'Serializable' });
  });
}
