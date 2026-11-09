import { z } from 'zod';
import { isoDate, positions, statuses } from './domain.js';
import type { MarketCurrency } from './player-market.js';

export const playerSorts = ['name', 'primaryPosition', 'status', 'levelScore', 'marketValue', 'contractEndDate', 'availability'] as const;
export const playerTag = z.string().trim().min(1).max(40).refine(value => !value.includes('\0'));
export const playerFilters = z.object({
  q: z.string().max(100).default(''), status: z.enum(statuses).optional(),
  position: z.enum(positions).optional(), clubId: z.uuid().optional(), leagueId: z.uuid().optional(),
  availability: z.string().trim().min(1).max(60).optional(), tag: playerTag.optional(),
  currency: z.enum(['TRY', 'EUR', 'USD', 'GBP']).optional(),
  scoreMin: z.coerce.number().min(1).max(10).optional(), scoreMax: z.coerce.number().min(1).max(10).optional(),
  contractBefore: isoDate.optional(), sort: z.enum(playerSorts).default('name'), direction: z.enum(['asc', 'desc']).default('asc'),
}).strict();
export const playerListQuery = playerFilters.extend({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .refine(value => value.scoreMin === undefined || value.scoreMax === undefined || value.scoreMin <= value.scoreMax)
  .refine(value => value.sort !== 'marketValue' || !!value.currency);
export const playerTagBatch = z.object({
  records: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }).strict()).min(1).max(100)
    .refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
  mode: z.enum(['add', 'remove']), tag: playerTag,
}).strict();
export const playerColumns = ['position', 'age', 'club', 'league', 'score', 'fit', 'marketValue', 'contractEnd', 'availability', 'status', 'tags'] as const;
export const playerViewInput = z.object({
  name: z.string().trim().min(1).max(100), filters: playerFilters,
  columns: z.array(z.enum(playerColumns)).min(1).max(playerColumns.length).refine(columns => new Set(columns).size === columns.length),
}).strict();
export type PlayerFilters = z.infer<typeof playerFilters>;
export type PlayerColumn = typeof playerColumns[number];
export type PlayerView = { id: string; version: number } & z.infer<typeof playerViewInput>;
export type PlayerListRow = {
  id: string; name: string; version: number; isExample: boolean; status: typeof statuses[number]; primaryPosition: typeof positions[number];
  photo: boolean;
  tags: string[]; birthDate: string | null; availability: string; contractEndDate: string | null;
  levelScore: string | null; marketValue: string | null; marketValueCurrency: MarketCurrency | null;
  currentClub: { id: string; name: string } | null; currentLeague: { id: string; name: string } | null;
};

export function playerParams(filters: PlayerFilters, page?: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
  if (page) params.set('page', String(page));
  return params;
}
