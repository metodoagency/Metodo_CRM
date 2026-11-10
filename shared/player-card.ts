import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';
import { positions } from './domain.js';
import type { MarketCurrency } from './player-market.js';

export const playerFeet = ['LEFT', 'RIGHT', 'BOTH'] as const;
export const playerCardChanges = z.object({
  nationalities: z.array(z.string().trim().min(1).max(80)).max(8).refine(values => new Set(values.map(value => value.toLocaleLowerCase('tr'))).size === values.length),
  euPassport: z.boolean().nullable(),
  heightCm: z.number().int().min(80).max(250).nullable(),
  weightKg: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).refine(value => Number(value) >= 20 && Number(value) <= 250).nullable(),
  secondaryPositions: z.array(z.enum(positions)).max(7).refine(values => new Set(values).size === values.length),
  preferredFoot: z.enum(playerFeet).nullable(),
  currentClubId: z.uuid().nullable(),
  currentLeagueId: z.uuid().nullable(),
}).strict().partial().refine(changes => Object.keys(changes).length > 0);

const playerVersion = z.number().int().positive();
export const playerCardWrite = z.object({ version: playerVersion, changes: playerCardChanges, sourceUrl: manualSourceUrl.optional() }).strict();
export const privateCardInput = z.object({
  version: playerVersion, includeAge: z.boolean(), includeFit: z.boolean(),
}).strict().refine(input => input.includeAge || input.includeFit);

type LinkedRecord = { id: string; name: string };
export type PlayerCard = {
  id: string; name: string; version: number; isExample: boolean; photo: boolean; hasBirthDate: boolean;
  nationalities: string[]; euPassport: boolean | null; heightCm: number | null; weightKg: string | null;
  primaryPosition: typeof positions[number]; secondaryPositions: (typeof positions[number])[];
  preferredFoot: typeof playerFeet[number] | null; currentClub: LinkedRecord | null; currentLeague: LinkedRecord | null;
  contractEndDate: string | null; marketValue: string | null; marketValueCurrency: MarketCurrency | null; levelScore: string | null;
};

export type CardFit = { status: 'SUITABLE' | 'CLOSE'; tier: number; example: boolean }
  | { status: 'UNSUITABLE'; example: boolean };
export type PrivateCardFields = { age?: number | null; fit?: CardFit | null; expiresIn: number };
