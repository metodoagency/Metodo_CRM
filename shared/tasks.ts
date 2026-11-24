import { z } from 'zod';
import { isoDate } from './domain.js';

export const taskPriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const taskRecurrences = ['NONE', 'WEEKLY', 'MONTHLY'] as const;
export const taskLinkTypes = ['Club', 'Player', 'Person', 'Request', 'Contract', 'Meeting', 'Presentation', 'Agent', 'SignificantDate', 'UpdateProposal', 'Suggestion'] as const;
export const taskDate = isoDate.refine(date => date >= '0001-01-01', 'INVALID_DATE');
export const taskLink = z.object({ type: z.enum(taskLinkTypes), id: z.uuid() }).strict();
export const taskFields = z.object({
  name: z.string().trim().min(2).max(160), priority: z.enum(taskPriorities),
  dueDate: taskDate, recurrence: z.enum(taskRecurrences), linkedEntity: taskLink.nullable(),
}).strict();
export const taskCreate = taskFields;
export const taskPatch = z.object({ version: z.number().int().positive(), changes: taskFields.partial().refine(value => Object.keys(value).length > 0, 'EMPTY_PATCH') }).strict();
export const taskQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default(''),
  status: z.enum(['OPEN', 'DONE', 'all']).default('OPEN'), due: z.enum(['all', 'today', 'overdue', 'upcoming']).default('all'),
}).strict();
export const taskLinkQuery = z.object({ type: z.enum(taskLinkTypes), q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type TaskLink = z.infer<typeof taskLink>;
export type TaskInput = z.infer<typeof taskFields>;
export type TaskOccurrence = { nextDate: string | null; skippedMonths: string[]; limited: boolean };
export function nextTaskOccurrence(dueDate: string, recurrence: TaskInput['recurrence']): TaskOccurrence {
  taskDate.parse(dueDate);
  const result: TaskOccurrence = { nextDate: null, skippedMonths: [], limited: false };
  if (recurrence === 'NONE') return result;
  if (recurrence === 'WEEKLY') {
    const date = new Date(`${dueDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 7);
    const next = date.toISOString().slice(0, 10);
    return { ...result, ...(taskDate.safeParse(next).success ? { nextDate: next } : { limited: true }) };
  }
  const [year, month, day] = dueDate.split('-').map(Number);
  for (let offset = 1; offset <= 12; offset++) {
    const index = month - 1 + offset; const nextYear = year + Math.floor(index / 12);
    if (nextYear > 9999) break;
    const nextMonth = `${nextYear.toString().padStart(4, '0')}-${(index % 12 + 1).toString().padStart(2, '0')}`;
    const candidate = `${nextMonth}-${day.toString().padStart(2, '0')}`;
    if (taskDate.safeParse(candidate).success) return { ...result, nextDate: candidate };
    result.skippedMonths.push(nextMonth);
  }
  return { ...result, limited: true };
}
export function taskLinkPath(link: TaskLink): string | null {
  if (['Club', 'Player', 'Person', 'Request'].includes(link.type)) return `/record/${link.type}/${link.id}`;
  if (link.type === 'Contract') return `/contracts/${link.id}`;
  if (link.type === 'Meeting') return `/agenda?meeting=${link.id}`;
  if (link.type === 'Presentation') return `/presentations?presentation=${link.id}`;
  if (link.type === 'UpdateProposal') return '/proposals';
  if (link.type === 'Suggestion') return '/requests';
  if (link.type === 'Agent' || link.type === 'SignificantDate') return '/birthdays';
  return null;
}
export type TaskRecord = {
  id: string; version: number; name: string; priority: TaskInput['priority']; dueDate: string;
  status: 'OPEN' | 'DONE'; recurrence: TaskInput['recurrence']; isExample: boolean;
  linkedEntity: (TaskLink & { name: string }) | null; linkUnavailable: boolean;
  recurrenceGenerated: boolean; occurrence: TaskOccurrence; invalidDate: boolean;
  automation: { sourceDate: string; current: boolean } | null;
};
export type TaskSuccessor = { id: string; name: string; status: 'OPEN' | 'DONE'; dueDate: string; deleted: boolean };
export type TaskDetail = TaskRecord & { successor: TaskSuccessor | null; successorMissing: boolean };
export type TaskActionResult = { task: TaskDetail; reused: boolean };
