import { z } from 'zod';
import { taskDate } from './tasks.js';

const website = z.url().max(2000).refine(value => {
  try { const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase().replace(/\.$/, ''));
  } catch { return false; }
}, 'INVALID_WEBSITE');
export const brandFields = z.object({ name: z.string().trim().min(2).max(160), sector: z.string().trim().max(100), website: website.nullable(), relationStatus: z.enum(['NEW', 'WARM', 'ACTIVE', 'COLD']) }).strict();
export const brandCreate = brandFields.extend({ isExample: z.boolean().default(false) });
export const brandPatch = z.object({ version: z.number().int().positive(), changes: brandFields.partial().refine(value => Object.keys(value).length > 0, 'EMPTY_PATCH') }).strict();
export const brandQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default('') }).strict();
export const brandContactFields = z.object({ roleTitle: z.string().trim().max(100), startDate: taskDate.nullable(), endDate: taskDate.nullable() }).strict().refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, 'INVALID_DATE_RANGE');
export const brandContactCreate = z.object({ version: z.number().int().positive(), personId: z.uuid(), details: brandContactFields }).strict();
export const brandContactPatch = z.object({ version: z.number().int().positive(), brandVersion: z.number().int().positive(), details: brandContactFields }).strict();
export const brandContactDelete = z.object({ version: z.number().int().positive(), brandVersion: z.number().int().positive() }).strict();
export const brandContactParams = z.object({ id: z.uuid(), contactId: z.uuid() }).strict();
export type BrandInput = z.infer<typeof brandFields>;
export type BrandRecord = BrandInput & { id: string; version: number; isExample: boolean; contactCount: number };
export type BrandContact = z.infer<typeof brandContactFields> & { id: string; version: number; person: { id: string; name: string } };
