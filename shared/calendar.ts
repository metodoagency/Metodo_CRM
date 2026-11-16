import { z } from 'zod';
import { isoDate, istanbulToday } from './domain.js';

export const birthdayKinds = ['Person', 'Player', 'Agent'] as const;
export type BirthdayKind = typeof birthdayKinds[number];
export const defaultBirthdayThresholds = [30, 7, 0];
export const birthdayThresholds = z.array(z.number().int().min(0).max(365)).max(20)
  .refine(values => new Set(values).size === values.length);
const version = z.number().int().positive();
const dob = isoDate.refine(date => date <= istanbulToday(), 'FUTURE_DATE');
export const calendarPage = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
export const birthdayPage = calendarPage.extend({ view: z.enum(['month', 'reminders']).default('month') });
export const agentBirthdayQuery = calendarPage.extend({ q: z.string().trim().max(100).default('') });
export const birthdaySubject = z.object({ kind: z.enum(birthdayKinds), id: z.uuid() }).strict();
export const birthdayChange = z.object({ version, birthDate: dob.nullable().optional(), hideBirthYear: z.boolean() }).strict();
export const agentBirthdayCreate = z.object({ name: z.string().trim().min(2).max(160), birthDate: dob, hideBirthYear: z.boolean().default(false) }).strict();
export const greetingSubject = birthdaySubject.extend({ year: z.coerce.number().int().min(1900).max(9999) });
export const greetingWrite = z.object({ version: version.nullable(), greetingNote: z.string().trim().max(2000), sent: z.boolean() }).strict();
export const significantDateWrite = z.object({ name: z.string().trim().min(2).max(160), date: isoDate }).strict();
export const significantDateChange = significantDateWrite.extend({ version });

export function birthdayOccurrence(monthDay: string, year: number): string {
  const date = `${String(year).padStart(4, '0')}-${monthDay}`;
  return monthDay === '02-29' && !isoDate.safeParse(date).success ? `${year}-03-01` : date;
}

export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000;
}

export type BirthdayEntry = { kind: BirthdayKind; id: string; name: string; date: string; version: number; hideBirthYear: boolean; days: number; thresholds: number[]; sent: boolean };
export type BirthdayList = { items: BirthdayEntry[]; total: number; today: string; expiresIn: number };
export type Greeting = { version: number | null; greetingNote: string; sent: boolean; expiresIn: number };
export type SignificantDateItem = { id: string; version: number; name: string; date: string };
export type AgentBirthdayItem = { id: string; name: string; version: number; hideBirthYear: boolean };
