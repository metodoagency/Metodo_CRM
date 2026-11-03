import { z } from 'zod';
import { clubInput, entityTypes, personInput, playerInput, relationInput, requestInput, suggestionInput } from './domain.js';

export const idParams = z.object({ id: z.uuid() }).strict();
export const entityParams = z.object({ type: z.enum(entityTypes), id: z.uuid() }).strict();
export const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(100).default(''), status: z.enum(['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED']).optional() }).strict();
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
export const trashWrite = versionInput.extend({ recordVersion: z.number().int().positive() });
export const previewConfirmation = z.object({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const settingsInput = versionInput.extend({ language: z.enum(['tr', 'en']).optional(), theme: z.enum(['dark', 'light']).optional(), retentionDays: z.partialRecord(z.enum(entityTypes), z.number().int().min(1).max(3650)).optional() });
export const reviewInput = versionInput.extend({ action: z.enum(['approve', 'reject']), sourceUrl: z.url().optional(), reason: z.string().trim().min(3).max(4000).optional() });
export const revealInput = z.object({ field: z.enum(['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes']) }).strict();
export const patchInput = versionInput.extend({ changes: z.record(z.string(), z.unknown()) });
export type ApiContract = { method: 'get' | 'post' | 'patch' | 'delete'; path: string; query?: z.ZodType; params?: z.ZodType; body?: z.ZodType; success?: number; public?: boolean; testOnly?: boolean; csv?: boolean };
export const apiContracts: ApiContract[] = [
  { method: 'get', path: '/health', public: true }, { method: 'get', path: '/healthz', public: true },
  { method: 'get', path: '/auth/status', public: true }, { method: 'get', path: '/auth/google', public: true, success: 302 },
  { method: 'get', path: '/auth/google/callback', public: true, success: 302, query: z.object({ state: z.string().min(1), code: z.string().min(1) }) },
  { method: 'post', path: '/auth/test', public: true, testOnly: true, body: z.object({ email: z.email() }).strict() },
  { method: 'post', path: '/api/logout' }, { method: 'post', path: '/api/logout-all' },
  { method: 'get', path: '/api/me' }, { method: 'get', path: '/api/settings' }, { method: 'patch', path: '/api/settings', body: settingsInput },
  { method: 'get', path: '/api/overview' }, { method: 'get', path: '/api/docs' },
  ...([['clubs', clubInput], ['players', playerInput], ['people', personInput], ['requests', requestInput]] as const).flatMap(([path, schema]): ApiContract[] => [
    { method: 'get', path: `/api/${path}`, query: listQuery }, { method: 'post', path: `/api/${path}`, body: schema, success: 201 },
  ]),
  { method: 'post', path: '/api/suggestions', body: suggestionInput, success: 201 },
  { method: 'post', path: '/api/relations', body: relationInput, success: 201 },
  { method: 'get', path: '/api/records/:type/:id', params: entityParams },
  { method: 'patch', path: '/api/records/:type/:id', params: entityParams, body: patchInput },
  { method: 'delete', path: '/api/records/:type/:id', params: entityParams, body: versionInput },
  { method: 'get', path: '/api/records/:type/:id/links', params: entityParams },
  { method: 'get', path: '/api/records/:type/:id/timeline', params: entityParams, query: listQuery },
  { method: 'get', path: '/api/records/:type/:id/delete-preview', params: entityParams },
  { method: 'post', path: '/api/records/:type/:id/reveal', params: entityParams, body: revealInput },
  { method: 'get', path: '/api/trash' },
  { method: 'get', path: '/api/trash/:id/preview', params: idParams },
  { method: 'post', path: '/api/trash/:id/restore', params: idParams, body: trashWrite },
  { method: 'delete', path: '/api/trash/:id', params: idParams, body: trashWrite.extend(previewConfirmation.shape) },
  { method: 'get', path: '/api/admin/examples/preview' },
  { method: 'post', path: '/api/admin/examples/cleanup', body: previewConfirmation },
  { method: 'get', path: '/api/export/:type', params: z.object({ type: z.enum(entityTypes) }).strict(), csv: true },
  { method: 'get', path: '/api/proposals', query: listQuery },
  { method: 'post', path: '/api/proposals/:id/review', params: idParams, body: reviewInput },
];
export const emptyObject = z.object({}).strict();
