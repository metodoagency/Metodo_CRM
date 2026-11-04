import { z } from 'zod';

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
export const clubFilters = z.object({
  continentId: z.uuid().optional(),
  countryId: z.uuid().optional(),
  countryCode: countryCode.optional(),
  regionId: z.uuid().optional(),
  unassigned: z.literal('true').optional(),
}).strict();

const name = z.string().trim().min(1).max(100);
export const areaInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Continent'), name }).strict(),
  z.object({ type: z.literal('Country'), name, isoCode: countryCode, continentId: z.uuid() }).strict(),
  z.object({ type: z.literal('Region'), name, countryId: z.uuid() }).strict(),
]);

export const clubLocationInput = z.object({
  version: z.number().int().positive(),
  countryId: z.uuid().nullable(),
  regionId: z.uuid().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  city: z.string().trim().max(100).nullable(),
  stadium: z.string().trim().max(160).nullable(),
  relationStatus: z.enum(['NEW', 'WARM', 'ACTIVE', 'COLD']),
  isTracked: z.boolean(),
}).strict().refine(data => (data.lat === null) === (data.lng === null), { path: ['lat'] });

export const clubMapQuery = clubFilters.extend({ q: z.string().max(100).default('') });
export type ClubFilters = z.infer<typeof clubFilters>;
export type ClubGeography = {
  total: number;
  unassigned: number;
  continents: { id: string; name: string; count: number }[];
  countries: { id: string; name: string; isoCode: string; continentId: string | null; count: number }[];
  regions: { id: string; name: string; countryId: string; count: number }[];
};
export type ClubMarker = { id: string; name: string; lat: number; lng: number };
export const clubSections = ['staff', 'ageTeams', 'players', 'requests', 'updates', 'relationship', 'meetings', 'notes', 'sources', 'stakeholders', 'finance'] as const;
export const clubSectionParams = z.object({ id: z.uuid(), section: z.enum(clubSections) }).strict();
export const clubSectionQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  players: z.enum(['squad', 'suggested', 'sales', 'mandated']).default('squad'),
}).strict();
export const clubNoteInput = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
export type ClubSection = typeof clubSections[number];
export type ClubSectionRow = {
  id: string; name: string; label?: string; details?: string; href?: string;
  external?: boolean; date?: string | null; endDate?: string | null; nameEn?: string;
};

export function hasCoordinates(row: { lat?: number | null; lng?: number | null }): row is { lat: number; lng: number } {
  return typeof row.lat === 'number' && Number.isFinite(row.lat) && Math.abs(row.lat) <= 90
    && typeof row.lng === 'number' && Number.isFinite(row.lng) && Math.abs(row.lng) <= 180;
}
