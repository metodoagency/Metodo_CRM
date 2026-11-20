import { Prisma, type PrismaClient } from '@prisma/client';
import { birthdayOccurrence, birthdayThresholds, daysBetween, defaultBirthdayThresholds, type BirthdayEntry, type BirthdayKind, type BirthdayList } from '../shared/calendar.js';
import { isoDate, istanbulToday } from '../shared/domain.js';
import { live, type Tx } from './core.js';
import { decrypt } from './crypto.js';
import { agendaExport } from '../shared/meetings.js';

export const birthdayRule = 'BIRTHDAY';
export const calendarPageSize = 50;
export const sensitiveViewSeconds = 60;

const subjectSelect = { id: true, name: true, birthDate: true, hideBirthYear: true, isExample: true, version: true } as const;
async function birthdaySubjects(tx: Tx) {
  const query = { where: { ...live, birthDate: { not: null } }, select: subjectSelect };
  const [people, players, agents] = await Promise.all([tx.person.findMany(query), tx.player.findMany(query), tx.agent.findMany(query)]);
  return [...people.map(row => ({ ...row, kind: 'Person' as const })), ...players.map(row => ({ ...row, kind: 'Player' as const })), ...agents.map(row => ({ ...row, kind: 'Agent' as const }))];
}
// This collector has no notification or canonical writes. Callers audit only
// the selected, explicitly revealed page and never return the original DOB.
export async function birthdayRangeCandidates(tx: Tx, from: string, to: string, today: string) {
  agendaExport.parse({ from, to });
  const subjects = await birthdaySubjects(tx); const rows = [];
  for (const { birthDate, kind, id, name, isExample } of subjects) {
    const birthday = decrypt(birthDate!, `${kind}.birthDate`);
    if (!isoDate.safeParse(birthday).success || birthday > today) continue;
    for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      const date = birthdayOccurrence(birthday.slice(5), year);
      if (date >= from && date <= to && date >= birthday) rows.push({ id, kind, name, isExample, date });
    }
  }
  return rows;
}
export function birthdayRecord(tx: Tx, kind: BirthdayKind, id: string) {
  const query = { where: { ...live, id }, select: { ...subjectSelect, fieldProvenance: true } };
  return kind === 'Person' ? tx.person.findFirst(query) : kind === 'Player' ? tx.player.findFirst(query) : tx.agent.findFirst(query);
}

async function calendarCandidates(tx: Tx, today: string, reminders: boolean) {
  const [subjects, settings] = await Promise.all([
    birthdaySubjects(tx),
    reminders ? tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { birthdayThresholds: true } }) : null,
  ]);
  const thresholds = reminders ? birthdayThresholds.parse(settings?.birthdayThresholds ?? defaultBirthdayThresholds).sort((a, b) => b - a) : [];
  const year = Number(today.slice(0, 4));
  return subjects.flatMap(({ birthDate, kind, ...row }) => {
    const birthday = decrypt(birthDate!, `${kind}.birthDate`);
    if (!isoDate.safeParse(birthday).success || birthday > today) return [];
    const years = reminders ? [year, year + 1] : [year];
    return years.flatMap(occurrenceYear => {
      const date = birthdayOccurrence(birthday.slice(5), occurrenceYear);
      const days = daysBetween(today, date);
      const eligible = thresholds.filter(threshold => days >= 0 && days <= threshold);
      if (reminders ? !eligible.length : !date.startsWith(today.slice(0, 7))) return [];
      return [{ ...row, kind, date, days, thresholds: eligible }];
    });
  });
}

type Candidate = Awaited<ReturnType<typeof calendarCandidates>>[number];
const dedupeKey = (row: Candidate, threshold: number) => `${live.ownerId}:${birthdayRule}:${row.kind}:${row.id}:${threshold}:${row.date}`;
async function persistReminders(tx: Tx, rows: Candidate[]) {
  const data: Prisma.NotificationCreateManyInput[] = rows.flatMap(row => row.thresholds.map(threshold => ({
    type: birthdayRule, entityType: row.kind, entityId: row.id, thresholdDays: threshold,
    targetDate: new Date(row.date), dedupeKey: dedupeKey(row, threshold), isExample: row.isExample,
  }))).sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));
  let created = 0;
  for (let start = 0; start < data.length; start += 500) {
    created += (await tx.notification.createMany({ data: data.slice(start, start + 500), skipDuplicates: true })).count;
  }
  return created;
}

export async function birthdayTransaction<T>(db: PrismaClient, work: (tx: Tx) => Promise<T>): Promise<T> {
  // Birthday references are polymorphic. The read and ensuing writes must
  // serialize with an owner purge that reads the dependency graph.
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error;
    }
  }
}

export function refreshBirthdayReminders(db: PrismaClient, now = new Date()) {
  return birthdayTransaction(db, async tx => persistReminders(tx, await calendarCandidates(tx, istanbulToday(now), true)));
}

export async function readBirthdayCalendar(tx: Tx, view: 'month' | 'reminders', page: number, now = new Date()): Promise<BirthdayList> {
  const today = istanbulToday(now);
  const rows = await calendarCandidates(tx, today, view === 'reminders');
  const sorted = rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'tr') || a.id.localeCompare(b.id));
  const selected = sorted.slice((page - 1) * calendarPageSize, page * calendarPageSize);
  if (view === 'reminders') await persistReminders(tx, selected);
  if (!selected.length) return { items: [], total: sorted.length, today, expiresIn: sensitiveViewSeconds };
  const greetings = await tx.birthdayGreeting.findMany({
    where: { ...live, sentAt: { not: null }, OR: selected.map(row => ({ entityType: row.kind, entityId: row.id, year: Number(row.date.slice(0, 4)) })) },
    select: { entityType: true, entityId: true, year: true },
  });
  const sent = new Set(greetings.map(row => `${row.entityType}:${row.entityId}:${row.year}`));
  await tx.auditLog.createMany({ data: selected.map(row => ({
    entityType: row.kind, entityId: row.id, isExample: row.isExample, actor: 'owner', action: 'reveal', diffs: { field: 'birthDate' },
  })) });
  const items: BirthdayEntry[] = selected.map(({ isExample: _example, ...row }) => ({
    ...row, sent: sent.has(`${row.kind}:${row.id}:${row.date.slice(0, 4)}`),
  }));
  return { items, total: sorted.length, today, expiresIn: sensitiveViewSeconds };
}
