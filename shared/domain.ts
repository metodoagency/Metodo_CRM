import { z } from 'zod';
import { fieldSource, withProvenance } from './provenance.js';

export const positions = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WF', 'CF'] as const;
export const statuses = ['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED'] as const;
export const sensitiveKeys = new Set(['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes', 'guardian', 'medicalRecords', 'salaryAmount', 'salary', 'bonuses', 'commissionTerms', 'birthDateIndex', 'phoneIndex', 'emailIndex', 'breachContact']);
for (const field of ['document', 'processingPayload', 'processingResult']) sensitiveKeys.add(field);
export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
export function istanbulToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'INVALID_DATE');
export function ageOn(birthDate: string, today = istanbulToday()): number {
  isoDate.parse(birthDate); isoDate.parse(today);
  return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // Hydrated Decimal values serialize as strings. Traversing their internal
    // properties would copy a constructor function into JSON audit fields.
    if ('toJSON' in value && typeof value.toJSON === 'function') return maskSensitive(value.toJSON());
    return Object.fromEntries(Object.entries(value).map(([key, v]) => {
      if (key === 'fieldProvenance' && v && typeof v === 'object') {
        // Evidence carries metadata only. Re-validate instead of treating field
        // names as values, or sensitive-field provenance would become "***".
        return [key, Object.fromEntries(Object.entries(v).flatMap(([field, source]) => { const parsed = fieldSource.safeParse(source); return parsed.success ? [[field, parsed.data]] : []; }))];
      }
      return [key, sensitiveKeys.has(key) ? '***' : maskSensitive(v)];
    }));
  }
  return value;
}
const name = z.string().trim().min(2).max(160);
export const clubInput = withProvenance({ name, city: z.string().trim().max(100).optional(), isTracked: z.boolean().default(false), relationStatus: z.enum(['NEW', 'WARM', 'ACTIVE', 'COLD']).default('NEW') });
export const playerInput = withProvenance({ name, primaryPosition: z.enum(positions), status: z.enum(statuses).default('TARGET'), currentClubId: z.string().uuid().optional(), birthDate: isoDate.refine(value => value <= istanbulToday(), 'FUTURE_DATE').optional() });
export const personInput = withProvenance({ name, role: z.enum(['HEAD_COACH', 'ASSISTANT', 'GOALKEEPER_COACH', 'YOUTH_COORDINATOR', 'OFFICIAL', 'SCOUT', 'OTHER']).default('OTHER') });
export const requestInput = withProvenance({ name, clubId: z.string().uuid(), requesterId: z.string().uuid(), position: z.enum(positions), deadline: isoDate.optional() });
export const suggestionInput = z.object({ requestId: z.string().uuid(), playerId: z.string().uuid(), personId: z.string().uuid(), whyGoodTransfer: z.string().trim().min(3).max(4000), matchScore: z.number().min(0).max(100).nullable().default(null), followUpDate: isoDate.optional() }).strict();
export const relationTypes = ['memberOf', 'representedBy', 'intermediaryFor', 'sellingFor', 'mandatedBy', 'suggestedTo', 'presentedTo', 'invitedAs', 'attendee', 'contactOf', 'worksWith', 'partnerOf', 'usesTool', 'hiredBy', 'speakerAt', 'organizedBy', 'scoutedAt', 'linkedTo'] as const;
export const entityTypes = ['Club', 'Player', 'Person', 'Request'] as const;
export const relationInput = z.object({ fromType: z.enum(entityTypes), fromId: z.string().uuid(), toType: z.enum(entityTypes), toId: z.string().uuid(), relation: z.enum(relationTypes), role: z.string().max(100).optional(), startDate: isoDate.optional(), note: z.string().max(2000).default('') }).strict();
export const positionCriteria = {
  GK: ['reflexes', 'distribution', 'command'], CB: ['duels', 'buildUp', 'positioning'],
  FB: ['recovery', 'crossing', 'oneOnOne'], DM: ['interception', 'passing', 'positioning'],
  CM: ['passing', 'workRate', 'vision'], AM: ['creativity', 'vision', 'finishing'],
  WF: ['dribbling', 'pace', 'finishing'], CF: ['finishing', 'movement', 'holdUp'],
} as const;
