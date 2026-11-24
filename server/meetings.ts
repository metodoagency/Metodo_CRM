import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type Meeting, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams, versionInput } from '../shared/contracts.js';
import { istanbulToday, normalizeSearch } from '../shared/domain.js';
import { agendaExport, agendaQuery, meetingCreate, meetingParticipant, meetingPatch, meetingTaskCommit, meetingTaskPreview as taskPreviewInput, meetingTimeInput, participantQuery, type MeetingInput, type MeetingReference } from '../shared/meetings.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { hash, sessionCookie } from './auth.js';
import { keyring } from './crypto.js';
import { meetingTimePreview } from './meeting-time.js';
import { resolveTaskLink, taskLinkRecords } from './task-parent.js';
import { createTaskRecord, requireExampleName } from './tasks.js';
import { meetingCalendar } from './meeting-ics.js';

const date = (value: Date) => value.toISOString().slice(0, 10);
const privateFields = new Set(['agenda', 'notes', 'outcome', 'locationOrUrl', 'participants']);
const named = { id: true, name: true } as const;
const expiryMs = 10 * 60_000;
function timing(row: Pick<Meeting, 'date' | 'time' | 'durationMin' | 'utcOffsetSeconds'>) {
  return meetingTimePreview({ date: date(row.date), time: row.time, durationMin: row.durationMin, utcOffsetSeconds: row.utcOffsetSeconds });
}
async function requireMeeting(tx: Tx, id: string) {
  const row = await tx.meeting.findFirst({ where: { ...live, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
function normalizedTiming({ date, time, durationMin, utcOffsetSeconds }: Pick<MeetingInput, 'date' | 'time' | 'durationMin' | 'utcOffsetSeconds'>) {
  const preview = meetingTimePreview({ date, time, durationMin, utcOffsetSeconds });
  if (!preview.selected) throw new AppError(`MEETING_TIME_${preview.issue ?? 'INVALID'}`);
  return preview.selected;
}
async function participant(tx: Tx, ref: MeetingReference) {
  if (ref.type === 'Task') return tx.task.findFirst({ where: { ...live, id: ref.id }, select: named });
  return resolveTaskLink(tx, ref.type, ref.id);
}
async function validateParticipants(tx: Tx, rows: MeetingReference[]) {
  for (const row of rows) if (!await participant(tx, row)) throw new AppError('MEETING_PARTICIPANT_UNAVAILABLE', 409);
}
async function participantsDto(tx: Tx, value: Prisma.JsonValue) {
  const rows = Array.isArray(value) ? value : [];
  const items = []; let legacy = !meetingCreate.shape.participants.safeParse(value).success;
  for (const entry of rows) {
    const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const ref = meetingParticipant.safeParse({ type: source.type, id: source.id });
    if (!meetingParticipant.safeParse(entry).success) legacy = true;
    const found = ref.success ? await participant(tx, ref.data) : null;
    items.push({ reference: ref.success ? ref.data : null, name: found?.name ?? null, unavailable: !found });
  }
  return { items, legacy };
}
function summary(row: Meeting) {
  return { id: row.id, version: row.version, name: row.name, date: date(row.date), time: row.time, durationMin: row.durationMin, utcOffsetSeconds: row.utcOffsetSeconds, isExample: row.isExample, timing: timing(row) };
}
async function detail(tx: Tx, row: Meeting) {
  const participants = await participantsDto(tx, row.participants);
  return { ...summary(row), locationOrUrl: row.locationOrUrl, agenda: row.agenda, notes: row.notes, outcome: row.outcome,
    participants: participants.items, legacyParticipants: participants.legacy };
}
function auditFields(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, privateFields.has(key) ? '***' : value instanceof Date ? date(value) : value]));
}
function signature(sessionHash: string, value: unknown) {
  return createHmac('sha256', Buffer.from(keyring().blind, 'base64')).update('MeetingTaskPreview:v1:').update(sessionHash).update(JSON.stringify(value)).digest('hex');
}
function signedPayload(meetingId: string, version: number, taskId: string, expiresAt: string, draft: unknown) { return { ownerId: live.ownerId, meetingId, version, taskId, expiresAt, draft }; }

export async function registerMeetings(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/agenda/ics', async (req, reply) => {
    const { from, to } = agendaExport.parse(req.body);
    const output = await db.$transaction(async tx => {
      const rows = await tx.meeting.findMany({ where: { ...live, date: { gte: new Date(from), lte: new Date(to) } }, orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }], take: 1001,
        select: { id: true, name: true, date: true, time: true, durationMin: true, utcOffsetSeconds: true, version: true, isExample: true } });
      const result = meetingCalendar(rows.map(row => ({ ...row, date: date(row.date) })));
      const batchId = randomUUID();
      for (const row of rows) await logEvent(tx, { entityType: 'Meeting', entityId: row.id, name: row.name, action: 'export', isExample: row.isExample, batchId, diffs: { new: { format: 'ICS', recordVersion: row.version } } });
      return result;
    }, { isolationLevel: 'Serializable' });
    return reply.header('content-type', 'text/calendar; charset=utf-8').header('content-disposition', `attachment; filename="metodo-agenda-${from}-${to}.ics"`).send(output);
  });
  app.post('/api/meetings/:id/ics', async (req, reply) => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    const output = await db.$transaction(async tx => {
      const row = await requireMeeting(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const result = meetingCalendar([{ ...row, date: date(row.date) }]);
      await logEvent(tx, { entityType: 'Meeting', entityId: id, name: row.name, action: 'export', isExample: row.isExample, diffs: { new: { format: 'ICS', recordVersion: row.version } } });
      return result;
    }, { isolationLevel: 'Serializable' });
    return reply.header('content-type', 'text/calendar; charset=utf-8').header('content-disposition', `attachment; filename="metodo-meeting-${id}.ics"`).send(output);
  });
  app.post('/api/meetings/time-preview', async req => meetingTimePreview(meetingTimeInput.parse(req.body)));
  app.get('/api/meetings/participants', async req => {
    const { type, q, page } = participantQuery.parse(req.query);
    return db.$transaction(async tx => {
      const rows = type === 'Task' ? await tx.task.findMany({ where: live, select: named, orderBy: [{ name: 'asc' }, { id: 'asc' }] }) : await taskLinkRecords(tx, type);
      const found = rows.filter(row => normalizeSearch(row.name).includes(normalizeSearch(q)));
      return { items: found.slice((page - 1) * 50, page * 50), total: found.length, page, pageSize: 50 };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/agenda', async req => {
    const { from, to, page, q } = agendaQuery.parse(req.query);
    return db.$transaction(async tx => {
      const rows = await tx.meeting.findMany({ where: { ...live, date: { gte: new Date(from), lte: new Date(to) } }, orderBy: [{ date: 'asc' }, { time: 'asc' }, { id: 'asc' }] });
      const found = rows.filter(row => normalizeSearch(row.name).includes(normalizeSearch(q)));
      return { items: found.slice((page - 1) * 50, page * 50).map(summary), total: found.length, page, pageSize: 50, from, to, today: istanbulToday() };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/meetings/:id', async req => db.$transaction(async tx => detail(tx, await requireMeeting(tx, idParams.parse(req.params).id)), { isolationLevel: 'RepeatableRead' }));
  app.get('/api/meetings/:id/timeline', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      await requireMeeting(tx, id);
      return tx.timelineEvent.findMany({ where: { ...live, entityType: 'Meeting', entityId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100,
        select: { id: true, action: true, actor: true, createdAt: true, summaryTr: true, summaryEn: true, diffs: true, batchId: true } });
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/meetings', async (req, reply) => {
    const input = meetingCreate.parse(req.body); const chosen = normalizedTiming(input);
    const saved = await db.$transaction(async tx => {
      await validateParticipants(tx, input.participants);
      const data = { ...input, utcOffsetSeconds: chosen.offsetSeconds, date: new Date(input.date) };
      const row = await tx.meeting.create({ data: { ...data, fieldProvenance: provenanceFor(data) } });
      await logEvent(tx, { entityType: 'Meeting', entityId: row.id, name: row.name, action: 'create', diffs: { new: auditFields(data) } });
      return detail(tx, row);
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(saved);
  });
  app.patch('/api/meetings/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, changes } = meetingPatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireMeeting(tx, id); if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      if (changes.name !== undefined) requireExampleName(before.isExample, changes.name);
      if (changes.participants !== undefined) await validateParticipants(tx, changes.participants);
      const timeChanged = changes.date !== undefined || changes.time !== undefined || changes.durationMin !== undefined || changes.utcOffsetSeconds !== undefined;
      const wallChanged = changes.date !== undefined && changes.date !== date(before.date) || changes.time !== undefined && changes.time !== before.time;
      const chosen = timeChanged ? normalizedTiming({ date: changes.date ?? date(before.date), time: changes.time ?? before.time,
        durationMin: changes.durationMin ?? before.durationMin, utcOffsetSeconds: changes.utcOffsetSeconds !== undefined ? changes.utcOffsetSeconds : wallChanged ? null : before.utcOffsetSeconds }) : null;
      const data = { ...changes, ...(changes.date === undefined ? {} : { date: new Date(changes.date) }), ...(chosen ? { utcOffsetSeconds: chosen.offsetSeconds } : {}) };
      if ((await tx.meeting.updateMany({ where: { ...live, id, version }, data: { ...data, version: { increment: 1 }, fieldProvenance: provenanceFor(data, before.fieldProvenance) } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      const old = Object.fromEntries(Object.keys(data).map(key => [key, before[key as keyof Meeting]]));
      const row = await requireMeeting(tx, id);
      await logEvent(tx, { entityType: 'Meeting', entityId: id, name: row.name, action: 'update', isExample: row.isExample, diffs: { old: auditFields(old), new: auditFields(data) } });
      return detail(tx, row);
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/meetings/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireMeeting(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { retentionDays: true } });
      const days = retentionPeriods.parse(settings?.retentionDays ?? {}).Meeting ?? 30; const now = new Date();
      if ((await tx.meeting.updateMany({ where: { ...live, id, version }, data: { deletedAt: now, version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      await tx.trashEntry.create({ data: { entityType: 'Meeting', entityId: id, label: row.name, isExample: row.isExample, expiresAt: new Date(now.getTime() + days * 86400_000) } });
      await logEvent(tx, { entityType: 'Meeting', entityId: id, name: row.name, action: 'delete', isExample: row.isExample, diffs: { old: { deletedAt: null }, new: { deletedAt: now.toISOString() } } });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/meetings/:id/tasks/preview', async req => {
    const { id } = idParams.parse(req.params); const { version, draft } = taskPreviewInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireMeeting(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      requireExampleName(row.isExample, draft.name);
      const taskId = randomUUID(); const expiresAt = new Date(Date.now() + expiryMs).toISOString();
      return { taskId, expiresAt, previewToken: signature(hash(req.cookies[sessionCookie]!), signedPayload(id, version, taskId, expiresAt, draft)),
        changes: { createTask: { id: taskId, ...draft, linkedEntity: { type: 'Meeting', id }, isExample: row.isExample, status: 'OPEN', version: 1 }, updateMeeting: { id, beforeVersion: version, afterVersion: version + 1 } } };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/meetings/:id/tasks', async req => {
    const { id } = idParams.parse(req.params); const { version, draft, taskId, expiresAt, previewToken } = meetingTaskCommit.parse(req.body);
    const expected = signature(hash(req.cookies[sessionCookie]!), signedPayload(id, version, taskId, expiresAt, draft));
    if (Date.parse(expiresAt) <= Date.now() || !timingSafeEqual(Buffer.from(previewToken, 'hex'), Buffer.from(expected, 'hex'))) throw new AppError('STALE_PREVIEW', 409);
    return db.$transaction(async tx => {
      const row = await requireMeeting(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const batchId = randomUUID();
      const task = await createTaskRecord(tx, { ...draft, linkedEntity: { type: 'Meeting', id } }, { id: taskId, isExample: row.isExample, batchId, generationKey: `meeting:${id}:${version}` });
      if ((await tx.meeting.updateMany({ where: { ...live, id, version }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'Meeting', entityId: id, name: row.name, action: 'update', isExample: row.isExample, batchId, diffs: { new: { taskId: task.id } } });
      return { taskId: task.id, meetingVersion: version + 1 };
    }, { isolationLevel: 'Serializable' });
  });
}
