import { z } from 'zod';
import { isoDate, positions } from './domain.js';
import { marketAmount, marketCurrencies } from './player-market.js';
import { withProvenance, type FieldSource } from './provenance.js';

export const requestStatuses = ['OPEN', 'MATCHED', 'SUGGESTED', 'CLOSED'] as const;
export const requestPriorities = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const footOptions = ['LEFT', 'RIGHT', 'BOTH'] as const;
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional();
const labels = z.array(z.string().trim().min(1).max(80)).max(30);
const budget = {
  salaryMax: optional(marketAmount), salaryCurrency: optional(z.enum(marketCurrencies)),
  feeMax: optional(marketAmount), feeCurrency: optional(z.enum(marketCurrencies)),
};
const age = z.number().int().min(1).max(120);

export const requestInput = withProvenance({
  name: z.string().trim().min(2).max(160),
  clubId: z.uuid(),
  requesterId: z.uuid(),
  position: z.enum(positions),
  ageMin: optional(age),
  ageMax: optional(age),
  preferredFoot: optional(z.enum(footOptions)),
  euRequired: optional(z.boolean()),
  preferredCountries: labels.optional(),
  preferredLeagues: labels.optional(),
  ...budget,
  profileText: z.string().trim().max(4000).optional(),
  tags: labels.optional(),
  priority: z.enum(requestPriorities).optional(),
  deadline: optional(isoDate),
  status: z.enum(requestStatuses).optional(),
});
export const requestChanges = requestInput.partial();
const page = z.coerce.number().int().min(1).max(100000).default(1);
export const requestListQuery = z.object({
  page, q: z.string().trim().max(100).default(''), status: z.enum(requestStatuses).optional(),
}).strict();
export const requestContactsQuery = z.object({ clubId: z.uuid() }).strict();
export const requestPageQuery = z.object({ page }).strict();
export type RequestInput = z.infer<typeof requestInput>;
export type RequestStatus = typeof requestStatuses[number];
export type NamedRecord = { id: string; name: string };
export type RequestRecord = Omit<RequestInput, 'requesterId' | 'fieldProvenance'> & {
  id: string; version: number; isExample: boolean; requesterId: string | null;
  createdAt: string; verificationStatus: string; fieldProvenance: Record<string, FieldSource>;
  status: RequestStatus; priority: typeof requestPriorities[number];
  club: NamedRecord | null; requester: NamedRecord | null;
};
export type RequestSuggestion = {
  id: string; date: string; whyGoodTransfer: string; matchScore: string | null;
  player: NamedRecord | null; person: NamedRecord | null; club: NamedRecord | null;
};
export const requestConstraintFields = ['ageMin', 'ageMax', 'salaryMax', 'salaryCurrency', 'feeMax', 'feeCurrency'] as const;

// Prisma Decimal and API decimal strings both support null checks. The amount
// and currency must be edited as a pair, even when the amount is zero.
export function validRequestConstraints(input: {
  ageMin?: number | null; ageMax?: number | null;
  salaryMax?: unknown; salaryCurrency?: string | null;
  feeMax?: unknown; feeCurrency?: string | null;
}) {
  return (input.ageMin == null || input.ageMax == null || input.ageMin <= input.ageMax)
    && (input.salaryMax == null) === (input.salaryCurrency == null)
    && (input.feeMax == null) === (input.feeCurrency == null);
}
