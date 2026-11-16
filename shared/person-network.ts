import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';
import { isoDate, personRoles } from './domain.js';

export const personNetworkSections = ['tenures', 'workedTogether', 'overlaps'] as const;
export const personNetworkQuery = z.object({
  section: z.enum(personNetworkSections).default('tenures'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).strict();
const tenureFields = z.object({
  role: z.enum(personRoles), startDate: isoDate.nullable(), endDate: isoDate.nullable(),
  sourceUrl: manualSourceUrl.nullable(),
}).strict();
const dateOrder = ({ startDate, endDate }: { startDate: string | null; endDate: string | null }) => !startDate || !endDate || startDate <= endDate;
export const tenureCreate = tenureFields.extend({ clubId: z.uuid() }).refine(dateOrder, { path: ['endDate'] });
export const tenureUpdate = tenureFields.extend({ version: z.number().int().positive() }).refine(dateOrder, { path: ['endDate'] });
export const tenureParams = z.object({ id: z.uuid(), relationId: z.uuid() }).strict();
export const ageParams = z.object({ type: z.enum(['Player', 'Person']), id: z.uuid() }).strict();

export type NetworkSection = typeof personNetworkSections[number];
export type PersonTenure = {
  id: string; version: number; clubId: string; clubName: string; role: string; startDate: string | null; endDate: string | null;
  sourceUrl: string | null; verificationStatus: string;
};
export type WorkedTogether = {
  id: string; personId: string; personName: string; clubId: string; clubName: string; startDate: string; lastDay: string;
};
export type OverlappingTenures = {
  id: string; firstClubId: string; firstClubName: string; firstRole: string;
  secondClubId: string; secondClubName: string; secondRole: string; startDate: string; lastDay: string;
};
export type AgeReveal = { age: number | null; minor: boolean | null; expiresIn: number };
