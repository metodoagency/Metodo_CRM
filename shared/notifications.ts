import { z } from 'zod';

export const notificationViews = ['unread', 'snoozed', 'read', 'all'] as const;
export const notificationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  view: z.enum(notificationViews).default('unread'),
}).strict();
export const notificationAction = z.object({
  version: z.number().int().positive(), action: z.enum(['read', 'snooze1', 'snooze7']),
}).strict();
export type NotificationAction = z.infer<typeof notificationAction>;
export function notificationTransition(action: NotificationAction['action'], now: Date) {
  return action === 'read' ? { status: 'READ' as const, snoozedUntil: null }
    : { status: 'SNOOZED' as const, snoozedUntil: new Date(now.getTime() + (action === 'snooze1' ? 1 : 7) * 86400_000) };
}
export function effectiveNotificationState(row: { status: 'NEW' | 'READ' | 'SNOOZED'; snoozedUntil: Date | null }, now: Date) {
  return row.status === 'SNOOZED' && (!row.snoozedUntil || row.snoozedUntil <= now) ? 'NEW' : row.status;
}
export type NotificationItem = {
  id: string; version: number; type: string; entityType: 'Contract'; entityId: string; name: string;
  targetDate: string; thresholdDays: number; status: 'NEW' | 'READ' | 'SNOOZED'; snoozedUntil: string | null;
};
export type NotificationList = { items: NotificationItem[]; total: number; unread: number; page: number; pageSize: number; now: string };
