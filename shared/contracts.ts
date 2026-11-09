import { z } from 'zod';
import { fileVersion, processingApprovalInput, processingPreviewInput } from './files.js';
import { documentInput, documentMime } from './documents.js';
import { areaInput, clubFilters, clubLocationInput, clubMapQuery, clubNoteInput, clubSectionParams, clubSectionQuery } from './club-network.js';
import { clubSourceInput, clubSourceList, clubSourceUpdate, manualSourceUrl } from './club-sources.js';
import { clubUpdateInput, clubUpdateReview } from './club-updates.js';
import { staffImportApply, staffImportInput, staffRoles } from './staff-import.js';
import { playerFilters, playerListQuery, playerTagBatch, playerViewInput } from './player-list.js';
import { playerScoringInput, positionWeights } from './player-scoring.js';
import { acknowledgePrivacy, incidentContactInput } from './privacy.js';
import { retentionPeriods, retentionPreviewInput, retentionPurgeInput } from './retention.js';
import { clubInput, entityTypes, isoDate, personInput, playerInput, relationInput, requestInput, suggestionInput } from './domain.js';

export const idParams = z.object({ id: z.uuid() }).strict();
export const entityParams = z.object({ type: z.enum(entityTypes), id: z.uuid() }).strict();
export const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(100).default(''), status: z.enum(['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED']).optional() }).strict();
export const clubListQuery = listQuery.extend(clubFilters.shape);
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
export const trashWrite = versionInput.extend({ recordVersion: z.number().int().positive() });
export const previewConfirmation = z.object({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const settingsInput = versionInput.extend({ language: z.enum(['tr', 'en']).optional(), theme: z.enum(['dark', 'light']).optional(), retentionDays: retentionPeriods.optional(), levelWeights: positionWeights.optional() });
export { staffRoles } from './staff-import.js';
const recordVersion = z.number().int().positive();
const tenureDigest = z.string().regex(/^[a-f0-9]{64}$/);
const proposalSourceUrl = manualSourceUrl;
export const staffProposalInput = z.object({
  type: z.enum(['coach_departure', 'coach_appointment']),
  name: z.string().trim().min(1).max(160), summary: z.string().trim().min(1).max(4000),
  sourceUrl: proposalSourceUrl.optional(),
}).strict();
export const reviewInput = versionInput.extend({
  action: z.enum(['approve', 'reject']),
  sourceUrl: proposalSourceUrl.optional(),
  reason: z.string().trim().min(3).max(4000).optional(),
  personId: z.uuid().optional(), effectiveDate: isoDate.optional(),
  clubVersion: recordVersion.optional(), personVersion: recordVersion.optional(), tenureToken: tenureDigest.optional(),
  staffRole: z.enum(staffRoles).optional(),
  predecessor: z.object({ personId: z.uuid(), version: recordVersion, tenureToken: tenureDigest }).strict().optional(),
  update: clubUpdateReview.optional(),
});
export const revealInput = z.object({ field: z.enum(['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes']) }).strict();
export const patchInput = versionInput.extend({ changes: z.record(z.string(), z.unknown()) });
export type ApiContract = { method: 'get' | 'post' | 'patch' | 'delete'; path: string; query?: z.ZodType; params?: z.ZodType; body?: z.ZodType; success?: number; public?: boolean; testOnly?: boolean; csv?: boolean; multipart?: boolean; download?: readonly string[] };
export const apiContracts: ApiContract[] = [
  { method: 'get', path: '/api/players/:id/scoring', params: idParams },
  { method: 'patch', path: '/api/players/:id/scoring', params: idParams, body: playerScoringInput },
  { method: 'get', path: '/api/players/options' },
  { method: 'get', path: '/api/players/export', query: playerFilters, csv: true },
  { method: 'post', path: '/api/players/tags', body: playerTagBatch },
  { method: 'get', path: '/api/players/views' },
  { method: 'post', path: '/api/players/views', body: playerViewInput, success: 201 },
  { method: 'delete', path: '/api/players/views/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/sources', query: clubSourceList },
  { method: 'post', path: '/api/sources', body: clubSourceInput, success: 201 },
  { method: 'patch', path: '/api/sources/:id', params: idParams, body: clubSourceUpdate },
  { method: 'delete', path: '/api/sources/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/clubs/geography' },
  { method: 'post', path: '/api/clubs/geography', body: areaInput, success: 201 },
  { method: 'get', path: '/api/clubs/markers', query: clubMapQuery },
  { method: 'patch', path: '/api/clubs/:id/location', params: idParams, body: clubLocationInput },
  { method: 'get', path: '/api/clubs/:id/sections/:section', params: clubSectionParams, query: clubSectionQuery },
  { method: 'post', path: '/api/clubs/:id/notes', params: idParams, body: clubNoteInput, success: 201 },
  { method: 'post', path: '/api/documents/profile/:id', params: idParams, body: documentInput, download: Object.values(documentMime) },
  { method: 'get', path: '/api/records/:type/:id/files', params: entityParams },
  { method: 'post', path: '/api/records/:type/:id/files', params: entityParams, multipart: true, success: 201 },
  { method: 'post', path: '/api/files/:id/download', params: idParams, body: fileVersion },
  { method: 'get', path: '/api/files/:id/content', params: idParams },
  { method: 'post', path: '/api/admin/files/cleanup' },
  { method: 'get', path: '/api/admin/files/status' },
  { method: 'get', path: '/api/processing/adapters' },
  { method: 'post', path: '/api/processing/preview', body: processingPreviewInput, success: 201 },
  { method: 'get', path: '/api/processing/:id', params: idParams },
  { method: 'post', path: '/api/processing/:id/approve', params: idParams, body: processingApprovalInput },
  { method: 'post', path: '/api/processing/:id/run', params: idParams, body: fileVersion },
  { method: 'get', path: '/health', public: true }, { method: 'get', path: '/healthz', public: true },
  { method: 'get', path: '/auth/status', public: true }, { method: 'get', path: '/auth/google', public: true, success: 302 },
  { method: 'get', path: '/auth/google/callback', public: true, success: 302, query: z.object({ state: z.string().min(1), code: z.string().min(1) }) },
  { method: 'post', path: '/auth/test', public: true, testOnly: true, body: z.object({ email: z.email() }).strict() },
  { method: 'post', path: '/api/logout' }, { method: 'post', path: '/api/logout-all' },
  { method: 'get', path: '/api/me' }, { method: 'get', path: '/api/settings' }, { method: 'patch', path: '/api/settings', body: settingsInput },
  { method: 'get', path: '/api/privacy' },
  { method: 'post', path: '/api/privacy/acknowledge', body: acknowledgePrivacy },
  { method: 'patch', path: '/api/privacy/incident-contact', body: incidentContactInput },
  { method: 'post', path: '/api/privacy/incident-contact/reveal' },
  { method: 'get', path: '/api/admin/retention' },
  { method: 'post', path: '/api/admin/retention/preview', body: retentionPreviewInput },
  { method: 'post', path: '/api/admin/retention/purge', body: retentionPurgeInput },
  { method: 'get', path: '/api/admin/access-log', query: listQuery },
  { method: 'get', path: '/api/overview' }, { method: 'get', path: '/api/docs' },
  ...([['clubs', clubInput], ['players', playerInput], ['people', personInput], ['requests', requestInput]] as const).flatMap(([path, schema]): ApiContract[] => [
    { method: 'get', path: `/api/${path}`, query: path === 'clubs' ? clubListQuery : path === 'players' ? playerListQuery : listQuery }, { method: 'post', path: `/api/${path}`, body: schema, success: 201 },
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
  { method: 'post', path: '/api/clubs/:id/staff-proposals', params: idParams, body: staffProposalInput, success: 201 },
  { method: 'post', path: '/api/clubs/:id/update-proposals', params: idParams, body: clubUpdateInput, success: 201 },
  { method: 'post', path: '/api/clubs/:id/staff-import/preview', params: idParams, body: staffImportInput },
  { method: 'post', path: '/api/clubs/:id/staff-import/apply', params: idParams, body: staffImportApply, success: 201 },
  { method: 'get', path: '/api/proposals/:id/context', params: idParams },
  { method: 'post', path: '/api/proposals/:id/review', params: idParams, body: reviewInput },
];
export const emptyObject = z.object({}).strict();
