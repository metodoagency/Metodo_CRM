import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';

export const playerImageMimes = ['image/webp', 'image/jpeg', 'image/png'] as const;
export const photoSelection = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), version: z.number().int().positive(), attachmentId: z.uuid(), attachmentVersion: z.number().int().positive(),
    sourceUrl: manualSourceUrl, rightsNote: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal('remove'), version: z.number().int().positive() }).strict(),
]);
const attachmentId = z.uuid();

export function activePhotoId(row: { photo: string | null; photoSourceUrl: string | null; photoRightsNote: string | null }) {
  return row.photoRightsNote?.trim() && manualSourceUrl.safeParse(row.photoSourceUrl).success ? attachmentId.safeParse(row.photo).data ?? null : null;
}
