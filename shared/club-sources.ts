import { z } from 'zod';
import { sourceTypes } from './provenance.js';

export const sourceTrustLevels = ['OFFICIAL', 'MEDIA', 'SOCIAL_VERIFIED'] as const;
export const manualSourceUrl = z.url({ protocol: /^https?$/ }).max(2048).refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password;
}, 'INVALID_SOURCE');
export const clubSourceInput = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum(sourceTypes),
  url: manualSourceUrl,
  trustLevel: z.enum(sourceTrustLevels),
  scanMethod: z.literal('MANUAL').default('MANUAL'),
  linkedClubIds: z.array(z.uuid()).max(100).refine(ids => new Set(ids).size === ids.length),
}).strict();
export const clubSourceUpdate = clubSourceInput.extend({ version: z.number().int().positive() });
export const clubSourceList = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  clubId: z.uuid().optional(),
}).strict();
export type ClubSource = Omit<z.infer<typeof clubSourceInput>, 'scanMethod'> & {
  id: string; version: number; scanMethod: 'MANUAL' | 'RSS' | 'PAGE_CHECK';
  clubs: { id: string; name: string }[];
};
