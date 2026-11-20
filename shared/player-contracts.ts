import { z } from 'zod';
import { isoDate } from './domain.js';
import { marketAmount, marketCurrencies } from './player-market.js';
import { manualSourceUrl } from './provenance.js';

const nullableDate = isoDate.nullable();
const terms = z.string().trim().max(4000);
const clause = z.object({
  amount: marketAmount.nullable(), currency: z.enum(marketCurrencies).nullable(),
  validFrom: nullableDate, validTo: nullableDate, conditions: terms, met: z.enum(['YES', 'NO', 'UNKNOWN']),
}).strict().superRefine((value, context) => {
  if (value.amount !== null && value.currency === null) context.addIssue({ code: 'custom', path: ['currency'], message: 'CURRENCY_REQUIRED' });
  if (value.validFrom && value.validTo && value.validFrom > value.validTo) context.addIssue({ code: 'custom', path: ['validTo'], message: 'DATE_ORDER' });
});

export const contractThresholds = z.array(z.number().int().min(0).max(365)).max(12)
  .refine(values => new Set(values).size === values.length, 'DUPLICATE_THRESHOLD');
export const defaultContractThresholds = [180, 90, 30] as const;
export const contractFields = z.object({
  name: z.string().trim().min(2).max(160), type: z.string().trim().min(1).max(100),
  clubId: z.uuid().nullable(), agentId: z.uuid().nullable(), signedDate: nullableDate,
  startDate: isoDate, endDate: isoDate, isActive: z.boolean(),
  salaryAmount: marketAmount.nullable(), salaryCurrency: z.enum(marketCurrencies).nullable(),
  salaryPeriod: z.enum(['YEAR', 'MONTH', 'WEEK', 'DAY', 'ONE_OFF']).nullable(), salaryBasis: z.enum(['GROSS', 'NET']).nullable(),
  bonuses: terms.min(1).nullable(), paymentDay: z.number().int().min(1).max(31).nullable(),
  releaseClause: clause.nullable(), buyout: clause.nullable(),
  extensionOption: z.object({ deadline: nullableDate, terms }).strict().nullable(), noticeDeadline: nullableDate,
  representation: z.object({
    scope: terms, startDate: nullableDate, endDate: nullableDate,
    commissionRate: z.string().regex(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/).nullable(), paymentTerms: terms,
  }).strict().refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { path: ['endDate'], message: 'DATE_ORDER' }).nullable(),
  documentLink: manualSourceUrl.nullable(), sourceUrl: manualSourceUrl, sourceDate: isoDate,
  methodNote: z.string().trim().min(1).max(1000),
}).strict();
export const contractInput = contractFields.superRefine((value, context) => {
  if (value.startDate > value.endDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'DATE_ORDER' });
  if (value.clubId && value.agentId) context.addIssue({ code: 'custom', path: ['agentId'], message: 'ONE_COUNTERPART' });
  if (value.salaryAmount !== null) for (const field of ['salaryCurrency', 'salaryPeriod', 'salaryBasis'] as const) {
    if (value[field] === null) context.addIssue({ code: 'custom', path: [field], message: 'SALARY_CONTEXT_REQUIRED' });
  }
  const representation = value.representation;
  if (representation?.startDate && representation.endDate && representation.startDate > representation.endDate) {
    context.addIssue({ code: 'custom', path: ['representation', 'endDate'], message: 'DATE_ORDER' });
  }
});
export type ContractInput = z.infer<typeof contractInput>;
export const contractPatch = z.object({ version: z.number().int().positive(), changes: contractFields.partial().refine(value => Object.keys(value).length > 0, 'EMPTY_CHANGE') }).strict();
export const contractListQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().max(100).default(''),
  playerId: z.uuid().optional(), active: z.enum(['true', 'false']).optional(),
}).strict();
export const contractReveal = z.object({ version: z.number().int().positive(), field: z.enum(['salaryAmount', 'bonuses', 'compliance']) }).strict();
export const contractNote = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
export const contractNotePatch = contractNote.extend({ version: z.number().int().positive() });
export const contractNoteParams = z.object({ id: z.uuid(), noteId: z.uuid() }).strict();
export type ContractRecord = Omit<ContractInput, 'salaryPeriod' | 'salaryBasis' | 'sourceUrl' | 'sourceDate' | 'methodNote' | 'releaseClause' | 'buyout' | 'extensionOption' | 'representation'> & {
  id: string; version: number; playerId: string; player: { id: string; name: string; status: string };
  club: { id: string; name: string } | null; agent: { id: string; name: string } | null;
  salaryPeriod: string | null; salaryBasis: string | null; sourceUrl: string | null; sourceDate: string | null; methodNote: string | null;
  releaseClause: unknown; buyout: unknown; extensionOption: unknown; representation: unknown;
  dates: ReturnType<typeof contractDeadlines>; legacyGroups: string[];
};

export const contractDeadlineKinds = [
  'CONTRACT_END', 'RELEASE_FROM', 'RELEASE_TO', 'BUYOUT_FROM', 'BUYOUT_TO',
  'EXTENSION_DEADLINE', 'NOTICE_DEADLINE', 'REPRESENTATION_END', 'PAYMENT_DAY',
] as const;
export type ContractDeadline = { kind: typeof contractDeadlineKinds[number]; date: string; thresholds: number[] };
export type ContractDates = {
  startDate: string; endDate: string; isActive: boolean; paymentDay: number | null; noticeDeadline: string | null;
  releaseClause: unknown; buyout: unknown; extensionOption: unknown; representation: unknown;
};
const dateAt = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || !(key in value)) return;
  const date = isoDate.safeParse((value as Record<string, unknown>)[key]);
  return date.success ? date.data : undefined;
};
function shiftMonth(month: string, offset: number): string | undefined {
  const absolute = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + offset;
  const year = Math.floor(absolute / 12);
  if (year < 0 || year > 9999) return;
  return `${String(year).padStart(4, '0')}-${String(absolute % 12 + 1).padStart(2, '0')}`;
}
// Pure calendar arithmetic. No fetch, canonical write, inference or legal outcome.
// Legacy undated clauses stay undated. Invalid monthly days are skipped, never clamped.
export function contractDeadlines(input: ContractDates, today: string, thresholds: readonly number[]): {
  deadlines: ContractDeadline[]; skippedPaymentMonths: string[]; issues: { field: string; code: 'DATE_ORDER' | 'INVALID_PAYMENT_DAY' }[];
} {
  isoDate.parse(today); isoDate.parse(input.startDate); isoDate.parse(input.endDate);
  contractThresholds.parse(thresholds);
  const deadlines: ContractDeadline[] = []; const skippedPaymentMonths: string[] = [];
  const issues: { field: string; code: 'DATE_ORDER' | 'INVALID_PAYMENT_DAY' }[] = [];
  if (input.startDate > input.endDate) issues.push({ field: 'endDate', code: 'DATE_ORDER' });
  if (!input.isActive || issues.length) return { deadlines, skippedPaymentMonths, issues };
  const add = (kind: ContractDeadline['kind'], date?: string | null) => {
    if (!date || !isoDate.safeParse(date).success || date < today) return;
    const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000;
    deadlines.push({ kind, date, thresholds: thresholds.filter(threshold => days <= threshold).sort((a, b) => b - a) });
  };
  add('CONTRACT_END', input.endDate); add('NOTICE_DEADLINE', input.noticeDeadline);
  for (const [field, fromKind, toKind] of [
    ['releaseClause', 'RELEASE_FROM', 'RELEASE_TO'], ['buyout', 'BUYOUT_FROM', 'BUYOUT_TO'],
  ] as const) {
    const from = dateAt(input[field], 'validFrom'); const to = dateAt(input[field], 'validTo');
    if (from && to && from > to) { issues.push({ field, code: 'DATE_ORDER' }); continue; }
    add(fromKind, from); add(toKind, to);
  }
  add('EXTENSION_DEADLINE', dateAt(input.extensionOption, 'deadline'));
  const representationFrom = dateAt(input.representation, 'startDate'); const representationTo = dateAt(input.representation, 'endDate');
  if (representationFrom && representationTo && representationFrom > representationTo) issues.push({ field: 'representation', code: 'DATE_ORDER' });
  else add('REPRESENTATION_END', representationTo);
  const validPaymentDay = input.paymentDay === null || z.number().int().min(1).max(31).safeParse(input.paymentDay).success;
  if (!validPaymentDay) issues.push({ field: 'paymentDay', code: 'INVALID_PAYMENT_DAY' });
  if (input.paymentDay !== null && validPaymentDay) {
    // Show the next month as well so invalid current-month dates are visible.
    // Reminder horizon is at most365 days; never expand a historical interval.
    const count = Math.max(1, Math.ceil(Math.max(0, ...thresholds) / 28));
    for (let offset = 0; offset <= count; offset++) {
      const month = shiftMonth(today.slice(0, 7), offset);
      if (!month || month > input.endDate.slice(0, 7)) break;
      if (month < input.startDate.slice(0, 7)) continue;
      const date = `${month}-${String(input.paymentDay).padStart(2, '0')}`;
      if (!isoDate.safeParse(date).success) { skippedPaymentMonths.push(month); continue; }
      if (date >= input.startDate && date <= input.endDate) add('PAYMENT_DAY', date);
    }
  }
  deadlines.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return { deadlines, skippedPaymentMonths, issues };
}
