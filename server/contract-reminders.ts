import { Prisma, type PrismaClient } from '@prisma/client';
import { contractDeadlines, contractThresholds, defaultContractThresholds } from '../shared/player-contracts.js';
import { istanbulToday } from '../shared/domain.js';
import { live, type Tx } from './core.js';
import { contractScope } from './contract-parent.js';
import { isCommitWriteConflict } from './runtime-adapter.js';

export const contractReminderPrefix = 'CONTRACT_';
export const contractCatchupDays = 7;
const reminderFields = {
  id: true, isExample: true, isActive: true, startDate: true, endDate: true, noticeDeadline: true, paymentDay: true,
  releaseClause: true, buyout: true, extensionOption: true, representation: true,
} as const;
function reminderDates(row: Prisma.ContractGetPayload<{ select: typeof reminderFields }>) {
  return { ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10),
    noticeDeadline: row.noticeDeadline?.toISOString().slice(0, 10) ?? null };
}
// Generation catch-up is bounded; existing alerts have no age-based expiry.
// Only changed/removed targets or inactive/deleted parents leave the current view.
export async function currentContractNotificationKeys(tx: Tx) {
  const records = await tx.contract.findMany({ where: { ...contractScope, isActive: true }, select: reminderFields });
  const parents = new Map(records.map(row => [row.id, row]));
  const rows = await tx.notification.findMany({ where: { ...live, entityType: 'Contract', entityId: { in: [...parents.keys()] }, type: { startsWith: contractReminderPrefix } },
    select: { entityId: true, targetDate: true, type: true, dedupeKey: true } });
  return rows.filter(row => {
    const date = row.targetDate.toISOString().slice(0, 10);
    return contractDeadlines(reminderDates(parents.get(row.entityId)!), date, []).deadlines
      .some(target => target.date === date && target.kind === row.type.slice(contractReminderPrefix.length));
  }).map(row => row.dedupeKey);
}
export async function contractReminderRows(tx: Tx, now = new Date()) {
  const today = istanbulToday(now);
  const lower = new Date(`${today}T00:00:00Z`); lower.setUTCDate(lower.getUTCDate() - contractCatchupDays);
  const since = lower.toISOString().slice(0, 10);
  const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { notificationThresholds: true } });
  const thresholds = contractThresholds.parse(settings?.notificationThresholds ?? [...defaultContractThresholds]);
  const records = await tx.contract.findMany({ where: { ...contractScope, isActive: true }, select: reminderFields });
  return records.flatMap(row => contractDeadlines(reminderDates(row), since, thresholds).deadlines.flatMap(deadline => {
    const days = (Date.parse(deadline.date) - Date.parse(today)) / 86400_000;
    return thresholds.filter(threshold => days <= threshold).map(threshold => ({
      type: `${contractReminderPrefix}${deadline.kind}`, entityType: 'Contract', entityId: row.id, thresholdDays: threshold,
      targetDate: new Date(deadline.date), isExample: row.isExample,
      dedupeKey: `${live.ownerId}:CONTRACT:${deadline.kind}:${row.id}:${threshold}:${deadline.date}`,
    }));
  })).sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));
}
export async function refreshContractReminders(db: PrismaClient, now = new Date()) {
  // Idempotent internal notification maintenance only; canonical writes never retry.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const rows = await contractReminderRows(tx, now); let created = 0;
        for (let offset = 0; offset < rows.length; offset += 500) created += (await tx.notification.createMany({ data: rows.slice(offset, offset + 500), skipDuplicates: true })).count;
        return created;
      }, { isolationLevel: 'Serializable', timeout: 30000 });
    } catch (error) {
      const conflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' || isCommitWriteConflict(error);
      if (!conflict || attempt >= 2) throw error;
    }
  }
}
