import { z } from 'zod';

export const maxBiographyHtml = 24_000;
export const biographyWrite = z.object({
  version: z.number().int().positive(),
  html: z.string().max(maxBiographyHtml),
}).strict();
