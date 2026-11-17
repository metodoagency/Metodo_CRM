import { z } from 'zod';
import { isoDate } from './domain.js';
import { manualSourceUrl } from './club-sources.js';
import { marketAmount, marketCurrencies } from './player-market.js';
import type { NamedRecord } from './transfer-requests.js';

export const saleStatuses = ['OPEN', 'CLOSED'] as const;
export const saleConfidentialities = ['PRIVATE', 'CLUB_ONLY', 'SHAREABLE'] as const;
const mandateFields = z.object({
  name: z.string().trim().min(2).max(160), scope: z.string().trim().min(1).max(4000),
  startDate: isoDate, endDate: isoDate, exclusive: z.boolean(),
  sourceUrl: manualSourceUrl.nullable(), documentRef: z.string().trim().max(1000).nullable(),
}).strict();
const orderedDates = (input: { startDate: string; endDate: string }) => input.startDate <= input.endDate;
export const mandateCreate = mandateFields.extend({ playerId: z.uuid() }).refine(orderedDates, { path: ['endDate'] });
export const mandateUpdate = mandateFields.extend({ version: z.number().int().positive() }).refine(orderedDates, { path: ['endDate'] });
const saleFields = z.object({
  askingAmount: marketAmount, currency: z.enum(marketCurrencies), confidentiality: z.enum(saleConfidentialities),
  scope: z.string().trim().min(1).max(4000), status: z.enum(saleStatuses),
}).strict();
export const saleCreate = saleFields.extend({ playerId: z.uuid() });
export const saleUpdate = saleFields.extend({ version: z.number().int().positive() });
export const salesQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
export type ClubMandate = z.infer<typeof mandateCreate> & { id: string; version: number; player: NamedRecord; current: boolean };
export type ClubSale = z.infer<typeof saleCreate> & { id: string; version: number; player: NamedRecord; authorized: boolean };
