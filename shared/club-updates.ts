import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';
import { isoDate } from './domain.js';

export const clubUpdateTypes = ['management', 'transfer', 'injury', 'league_category', 'stadium', 'commercial', 'other'] as const;
const title = z.string().trim().min(1).max(160);
const summary = z.string().trim().min(1).max(4000);
const stadium = z.string().trim().min(1).max(160);
const updateFields = { date: isoDate, sourceUrl: manualSourceUrl.optional() };

export const clubUpdateInput = z.discriminatedUnion('type', [
  z.object({ ...updateFields, type: z.enum(['management', 'transfer', 'league_category', 'commercial', 'other']), name: title, summary }).strict(),
  z.object({ ...updateFields, type: z.literal('stadium'), name: title, summary, stadium }).strict(),
  z.object({ ...updateFields, type: z.literal('injury') }).strict(),
]);
export const clubUpdateReview = z.object({ date: isoDate, name: title.optional(), summary: summary.optional(), stadium: stadium.optional() }).strict();
