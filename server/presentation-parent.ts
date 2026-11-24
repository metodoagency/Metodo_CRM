import type { Prisma } from '@prisma/client';
import { live } from './core.js';

// History may retain a deleted linked request, but new links and DTOs cannot expose it.
export const presentationLive = {
  ...live, club: live, person: live, player: live,
  OR: [{ requestId: null }, { request: live }],
} satisfies Prisma.PresentationWhereInput;
