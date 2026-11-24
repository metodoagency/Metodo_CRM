import { z } from 'zod';
import { entityTypes } from './domain.js';

export const externalResourceKinds = ['DOCUMENT', 'REPRESENTATION_CONTRACT', 'EMPLOYMENT_CONTRACT', 'SPONSOR_AGREEMENT', 'DOSSIER', 'CLIP', 'FULL_MATCH', 'PHOTO', 'DESIGN', 'FOLDER', 'OTHER'] as const;
export const driveUrl = z.string().trim().max(4096).refine(value => {
  if (Array.from(value).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\')) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
    if (url.hostname === 'drive.google.com') return /^\/file\/d\/[A-Za-z0-9_-]+(?:\/(?:view|preview|edit))?\/?$/.test(url.pathname)
      || /^\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      || url.pathname === '/open' && /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('id') ?? '');
    return url.hostname === 'docs.google.com' && /^\/(?:document|spreadsheets|presentation|drawings)\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+(?:\/(?:edit|view|preview))?\/?$/.test(url.pathname);
  } catch { return false; }
}, 'INVALID_DRIVE_URL');
export const resourceParent = z.object({ type: z.enum([...entityTypes, 'Suggestion', 'Contract']), id: z.string().uuid() }).strict();
export type ResourceParent = z.infer<typeof resourceParent>;
export const resourceParentFields = { Club: 'clubId', Player: 'playerId', Person: 'personId', Request: 'requestId', Suggestion: 'suggestionId', Contract: 'contractId' } as const;
export function resourceLinkParent(row: Record<string, unknown>): ResourceParent | null {
  let parent: ResourceParent | null = null;
  for (const type of Object.keys(resourceParentFields) as ResourceParent['type'][]) {
    const id = row[resourceParentFields[type]];
    if (id === null || id === undefined) continue;
    if (parent || typeof id !== 'string' || !z.string().uuid().safeParse(id).success) return null;
    parent = { type, id };
  }
  return parent;
}
export const externalResourceFields = z.object({ name: z.string().trim().min(2).max(160), kind: z.enum(externalResourceKinds), externalUrl: driveUrl }).strict();
export const externalResourceCreate = externalResourceFields.extend({ parent: resourceParent.optional(), isExample: z.boolean().default(false) });
export const externalResourcePatch = z.object({ version: z.number().int().positive(), changes: externalResourceFields.partial().refine(value => Object.keys(value).length > 0, 'EMPTY_PATCH') }).strict();
export const externalResourceQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().max(100).default(''), kind: z.enum(externalResourceKinds).optional() }).strict();
export const resourceLinkInput = z.object({ version: z.number().int().positive(), parent: resourceParent }).strict();
export const resourceUnlinkInput = z.object({ version: z.number().int().positive(), linkVersion: z.number().int().positive() }).strict();
export const resourceDeleteInput = z.object({ version: z.number().int().positive(), previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const resourceLinkParams = z.object({ id: z.string().uuid(), linkId: z.string().uuid() }).strict();
export type ExternalResourceInput = z.infer<typeof externalResourceFields>;
export type ExternalResourceInfo = { id: string; name: string; kind: typeof externalResourceKinds[number]; version: number; isExample: boolean; linkId?: string; linkVersion?: number };
export type ExternalResources = { items: ExternalResourceInfo[]; page: number; pageSize: number; total: number };
export type ExternalResourceView = { externalUrl: string; expiresIn: number; expiresAt: string };
export type ResourceConnections = { page: number; pageSize: number; total: number; items: { id: string; version: number; parent: ResourceParent; label: string | null; href: string | null }[] };
