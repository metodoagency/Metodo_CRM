import { z } from 'zod';
import { taskDate, taskFields, taskLinkTypes } from './tasks.js';

export const meetingParticipantTypes = [...taskLinkTypes, 'Task'] as const;
export const meetingParticipant = z.object({ type: z.enum(meetingParticipantTypes), id: z.uuid() }).strict();
const participants = z.array(meetingParticipant).max(50).refine(rows => new Set(rows.map(row => `${row.type}:${row.id}`)).size === rows.length, 'DUPLICATE_PARTICIPANT');
const text = (max: number) => z.string().max(max).refine(value => [...value].every(char => {
  const code = char.codePointAt(0)!; return code >= 32 && code !== 127 || code === 9 || code === 10 || code === 13;
}), 'INVALID_TEXT');
export const meetingTimeInput = z.object({
  date: taskDate, time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), durationMin: z.number().int().min(1).max(1440),
  utcOffsetSeconds: z.number().int().min(-86399).max(86399).nullable(),
}).strict();
export const meetingFields = meetingTimeInput.extend({
  name: text(160).trim().min(2),
  locationOrUrl: text(1000).nullable(), participants,
  agenda: text(8000), notes: text(16000), outcome: text(8000).nullable(),
});
export const meetingCreate = meetingFields;
export const meetingPatch = z.object({ version: z.number().int().positive(), changes: meetingFields.partial().refine(value => Object.keys(value).length > 0, 'EMPTY_PATCH') }).strict();
export const agendaQuery = z.object({
  from: taskDate, to: taskDate, page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default(''),
}).strict().refine(value => {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400_000;
  return days >= 0 && days < 62;
}, 'INVALID_RANGE');
export const participantQuery = z.object({ type: z.enum(meetingParticipantTypes), q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export const agendaExport = z.object({ from: taskDate, to: taskDate }).strict().refine(value => agendaQuery.safeParse(value).success, 'INVALID_RANGE');
export const meetingTaskDraft = taskFields.omit({ linkedEntity: true });
export const meetingTaskPreview = z.object({ version: z.number().int().positive(), draft: meetingTaskDraft }).strict();
export const meetingTaskCommit = meetingTaskPreview.extend({ taskId: z.uuid(), expiresAt: z.iso.datetime({ offset: true }), previewToken: z.string().regex(/^[a-f0-9]{64}$/) });
export type MeetingInput = z.infer<typeof meetingFields>;
export type MeetingReference = z.infer<typeof meetingParticipant>;
export type MeetingTimeInput = z.infer<typeof meetingTimeInput>;
export type MeetingTimeChoice = { instant: string; offsetSeconds: number; offsetLabel: string; endDate: string; endTime: string; endOffsetSeconds: number };
export type MeetingTimePreview = { timezone: 'Europe/Istanbul'; choices: MeetingTimeChoice[]; issue: 'GAP' | 'AMBIGUOUS' | 'OFFSET' | 'END_RANGE' | 'INVALID' | null; selected: MeetingTimeChoice | null };
export type MeetingSummary = { id: string; version: number; name: string; date: string; time: string; durationMin: number; utcOffsetSeconds: number | null; isExample: boolean; timing: MeetingTimePreview };
export type MeetingDetail = MeetingSummary & { locationOrUrl: string | null; agenda: string; notes: string; outcome: string | null; participants: { reference: MeetingReference | null; name: string | null; unavailable: boolean }[]; legacyParticipants: boolean };
export type MeetingTaskPlan = { taskId: string; expiresAt: string; previewToken: string; changes: { createTask: z.infer<typeof meetingTaskDraft> & { id: string; linkedEntity: { type: 'Meeting'; id: string }; isExample: boolean; status: 'OPEN'; version: number }; updateMeeting: { id: string; beforeVersion: number; afterVersion: number } } };
export type AgendaView = 'day' | 'week' | 'month';
export function agendaRange(anchor: string, view: AgendaView) {
  taskDate.parse(anchor); const value = new Date(`${anchor}T00:00:00Z`); let from = anchor; let to = anchor;
  const safeDay = (instant: number) => new Date(Math.min(Date.parse('9999-12-31'), Math.max(Date.parse('0001-01-01'), instant))).toISOString().slice(0, 10);
  if (view === 'week') { const monday = value.getTime() - ((value.getUTCDay() + 6) % 7) * 86400_000; from = safeDay(monday); to = safeDay(monday + 6 * 86400_000); }
  if (view === 'month') { from = anchor.slice(0, 7) + '-01'; value.setUTCMonth(value.getUTCMonth() + 1, 0); to = safeDay(value.getTime()); }
  const days: string[] = []; for (let instant = Date.parse(from); instant <= Date.parse(to); instant += 86400_000) days.push(safeDay(instant));
  return { from, to, days };
}
