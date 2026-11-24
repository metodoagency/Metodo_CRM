import { z } from 'zod';
import { campaignCreate, opportunityCreate, opportunityDetails, pipelineQuery, pipelineReveal, transitionInput, transitionPlan } from './pipeline.js';
import { membershipCommand, membershipPlan } from './sponsorship-membership.js';
import { externalResourceCreate, externalResourcePatch, externalResourceQuery, resourceLinkInput, resourceUnlinkInput, resourceLinkParams, resourceDeleteInput } from './external-resources.js';
import { fileVersion, processingApprovalInput, processingPreviewInput } from './files.js';
import { documentInput, documentMime } from './documents.js';
import { areaInput, clubFilters, clubLocationInput, clubMapQuery, clubNoteInput, clubSectionParams, clubSectionQuery } from './club-network.js';
import { clubSourceInput, clubSourceList, clubSourceUpdate, manualSourceUrl } from './club-sources.js';
import { clubUpdateInput, clubUpdateReview } from './club-updates.js';
import { staffImportApply, staffImportInput, staffRoles } from './staff-import.js';
import { playerFilters, playerListQuery, playerTagBatch, playerViewInput } from './player-list.js';
import { playerScoringInput, positionWeights } from './player-scoring.js';
import { marketPage, marketWrite } from './player-market.js';
import { photoSelection, playerImageMimes } from './player-photo.js';
import { leagueTiers } from './player-suitability.js';
import { playerCardWrite, privateCardInput } from './player-card.js';
import { biographyWrite } from './player-biography.js';
import { ageParams, personNetworkQuery, tenureCreate, tenureParams, tenureUpdate } from './person-network.js';
import { acknowledgePrivacy, incidentContactInput } from './privacy.js';
import { retentionPeriods, retentionPreviewInput, retentionPurgeInput } from './retention.js';
import { clubInput, entityTypes, isoDate, personInput, playerInput, relationInput, suggestionInput } from './domain.js';
import { requestContactsQuery, requestInput, requestListQuery, requestPageQuery } from './transfer-requests.js';
import { matrixQuery, presentationCreate, presentationQuery, presentationUpdate } from './presentations.js';
import { mandateCreate, mandateUpdate, saleCreate, salesQuery, saleUpdate } from './sales.js';
import { matchingSettings, matchQuery } from './transfer-matching.js';
import { contractInput, contractListQuery, contractNote, contractNoteParams, contractNotePatch, contractPatch, contractReveal, contractThresholds } from './player-contracts.js';
import { agentBirthdayCreate, agentBirthdayQuery, birthdayChange, birthdayPage, birthdaySubject, birthdayThresholds, calendarPage, greetingSubject, greetingWrite, significantDateChange, significantDateWrite } from './calendar.js';
import { notificationAction, notificationQuery } from './notifications.js';
import { taskCreate, taskLinkQuery, taskPatch, taskQuery } from './tasks.js';
import { presentationRuleInput, presentationRulePreview } from './presentation-tasks.js';
import { brandCreate, brandPatch, brandQuery, brandContactCreate, brandContactPatch, brandContactDelete, brandContactParams } from './sponsorship.js';
import { agendaExport, agendaQuery, meetingCreate, meetingPatch, meetingTaskCommit, meetingTaskPreview, meetingTimeInput, participantQuery } from './meetings.js';
import { dashboardLayout } from './dashboard.js';

export const idParams = z.object({ id: z.uuid() }).strict();
export const entityParams = z.object({ type: z.enum(entityTypes), id: z.uuid() }).strict();
export const fileParentParams = entityParams.extend({ type: z.enum([...entityTypes, 'Suggestion', 'Contract']) });
export const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(100).default(''), status: z.enum(['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED']).optional() }).strict();
export const clubListQuery = listQuery.extend(clubFilters.shape);
export const versionInput = z.object({ version: z.number().int().positive() }).strict();
export const fieldVerification = versionInput.extend({ field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/), sourceUrl: manualSourceUrl });
export const trashWrite = versionInput.extend({ recordVersion: z.number().int().positive() });
export const previewConfirmation = z.object({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const settingsInput = versionInput.extend({ language: z.enum(['tr', 'en']).optional(), theme: z.enum(['dark', 'light']).optional(), retentionDays: retentionPeriods.optional(), levelWeights: positionWeights.optional(), leagueTiers: leagueTiers.optional(), birthdayThresholds: birthdayThresholds.optional(), matchingWeights: matchingSettings.optional(), notificationThresholds: contractThresholds.optional(), dashboardLayout: dashboardLayout.optional() });
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
  { method: 'get', path: '/api/tasks', query: taskQuery },
  { method: 'get', path: '/api/brands', query: brandQuery },
  { method: 'post', path: '/api/brands', body: brandCreate, success: 201 },
  { method: 'get', path: '/api/brands/:id', params: idParams },
  { method: 'patch', path: '/api/brands/:id', params: idParams, body: brandPatch },
  { method: 'delete', path: '/api/brands/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/brands/:id/contacts', params: idParams, query: brandQuery.pick({ page: true }) },
  { method: 'post', path: '/api/brands/:id/contacts', params: idParams, body: brandContactCreate, success: 201 },
  { method: 'patch', path: '/api/brands/:id/contacts/:contactId', params: brandContactParams, body: brandContactPatch },
  { method: 'delete', path: '/api/brands/:id/contacts/:contactId', params: brandContactParams, body: brandContactDelete },
  { method: 'get', path: '/api/brands/:id/timeline', params: idParams },
  { method: 'get', path: '/api/task-rules/presentation' },
  { method: 'get', path: '/api/task-rules/presentation/candidates', query: z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict() },
  { method: 'post', path: '/api/task-rules/presentation/preview', body: presentationRuleInput },
  { method: 'post', path: '/api/task-rules/presentation/confirm', body: presentationRulePreview },
  { method: 'get', path: '/api/agenda', query: agendaQuery },
  { method: 'get', path: '/api/agenda/deadlines', query: agendaQuery },
  { method: 'post', path: '/api/agenda/birthdays/view', body: agendaQuery },
  { method: 'post', path: '/api/agenda/ics', body: agendaExport, download: ['text/calendar'] },
  { method: 'post', path: '/api/meetings/:id/ics', params: idParams, body: versionInput, download: ['text/calendar'] },
  { method: 'post', path: '/api/meetings/time-preview', body: meetingTimeInput },
  { method: 'get', path: '/api/meetings/participants', query: participantQuery },
  { method: 'get', path: '/api/meetings/:id', params: idParams },
  { method: 'get', path: '/api/meetings/:id/timeline', params: idParams },
  { method: 'post', path: '/api/meetings', body: meetingCreate, success: 201 },
  { method: 'patch', path: '/api/meetings/:id', params: idParams, body: meetingPatch },
  { method: 'delete', path: '/api/meetings/:id', params: idParams, body: versionInput },
  { method: 'post', path: '/api/meetings/:id/tasks/preview', params: idParams, body: meetingTaskPreview },
  { method: 'post', path: '/api/meetings/:id/tasks', params: idParams, body: meetingTaskCommit },
  { method: 'get', path: '/api/tasks/links', query: taskLinkQuery },
  { method: 'get', path: '/api/tasks/:id', params: idParams },
  { method: 'get', path: '/api/tasks/:id/timeline', params: idParams },
  { method: 'post', path: '/api/tasks', body: taskCreate, success: 201 },
  { method: 'patch', path: '/api/tasks/:id', params: idParams, body: taskPatch },
  { method: 'post', path: '/api/tasks/:id/complete', params: idParams, body: versionInput },
  { method: 'post', path: '/api/tasks/:id/reopen', params: idParams, body: versionInput },
  { method: 'delete', path: '/api/tasks/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/notifications', query: notificationQuery },
  { method: 'patch', path: '/api/notifications/:id', params: idParams, body: notificationAction },
  { method: 'get', path: '/api/contracts', query: contractListQuery },
  { method: 'get', path: '/api/contracts/reminders', query: contractListQuery },
  { method: 'post', path: '/api/contracts/reminders' },
  { method: 'get', path: '/api/contracts/:id', params: idParams },
  { method: 'post', path: '/api/players/:id/contracts', params: idParams, body: contractInput, success: 201 },
  { method: 'patch', path: '/api/contracts/:id', params: idParams, body: contractPatch },
  { method: 'delete', path: '/api/contracts/:id', params: idParams, body: versionInput },
  { method: 'post', path: '/api/contracts/:id/reveal', params: idParams, body: contractReveal },
  { method: 'get', path: '/api/contracts/:id/timeline', params: idParams },
  { method: 'get', path: '/api/contracts/:id/notes', params: idParams },
  { method: 'post', path: '/api/contracts/:id/notes', params: idParams, body: contractNote, success: 201 },
  { method: 'patch', path: '/api/contracts/:id/notes/:noteId', params: contractNoteParams, body: contractNotePatch },
  { method: 'delete', path: '/api/contracts/:id/notes/:noteId', params: contractNoteParams, body: versionInput },
  { method: 'post', path: '/api/calendar/birthdays', body: birthdayPage },
  { method: 'patch', path: '/api/calendar/birthdays/:kind/:id', params: birthdaySubject, body: birthdayChange },
  { method: 'post', path: '/api/calendar/birthdays/:kind/:id/view', params: birthdaySubject },
  { method: 'get', path: '/api/calendar/agents', query: agentBirthdayQuery },
  { method: 'post', path: '/api/calendar/agents', body: agentBirthdayCreate, success: 201 },
  { method: 'post', path: '/api/calendar/greetings/:kind/:id/:year/view', params: greetingSubject },
  { method: 'patch', path: '/api/calendar/greetings/:kind/:id/:year', params: greetingSubject, body: greetingWrite },
  { method: 'delete', path: '/api/calendar/greetings/:kind/:id/:year', params: greetingSubject, body: versionInput },
  { method: 'get', path: '/api/calendar/dates', query: calendarPage },
  { method: 'post', path: '/api/calendar/dates', body: significantDateWrite, success: 201 },
  { method: 'patch', path: '/api/calendar/dates/:id', params: idParams, body: significantDateChange },
  { method: 'delete', path: '/api/calendar/dates/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/people/:id/network', params: idParams, query: personNetworkQuery },
  { method: 'post', path: '/api/people/:id/tenures', params: idParams, body: tenureCreate, success: 201 },
  { method: 'patch', path: '/api/people/:id/tenures/:relationId', params: tenureParams, body: tenureUpdate },
  { method: 'post', path: '/api/records/:type/:id/age', params: ageParams },
  { method: 'patch', path: '/api/players/:id/biography', params: idParams, body: biographyWrite },
  { method: 'get', path: '/api/players/:id/card', params: idParams },
  { method: 'patch', path: '/api/players/:id/card', params: idParams, body: playerCardWrite },
  { method: 'post', path: '/api/players/:id/card/private', params: idParams, body: privateCardInput },
  { method: 'post', path: '/api/players/:id/suitability', params: idParams },
  { method: 'get', path: '/api/players/:id/photo', params: idParams, download: playerImageMimes },
  { method: 'patch', path: '/api/players/:id/photo', params: idParams, body: photoSelection },
  { method: 'get', path: '/api/players/:id/market', params: idParams, query: marketPage },
  { method: 'patch', path: '/api/players/:id/market', params: idParams, body: marketWrite },
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
  { method: 'post', path: '/api/documents/recommendation/:id', params: idParams, body: documentInput, download: Object.values(documentMime) },
  { method: 'get', path: '/api/records/:type/:id/files', params: fileParentParams },
  { method: 'get', path: '/api/resources', query: externalResourceQuery },
  { method: 'post', path: '/api/resources', body: externalResourceCreate, success: 201 },
  { method: 'patch', path: '/api/resources/:id', params: idParams, body: externalResourcePatch },
  { method: 'delete', path: '/api/resources/:id', params: idParams, body: resourceDeleteInput },
  { method: 'get', path: '/api/resources/:id/delete-preview', params: idParams },
  { method: 'post', path: '/api/resources/:id/reveal', params: idParams, body: fileVersion },
  { method: 'get', path: '/api/records/:type/:id/resources', params: fileParentParams, query: externalResourceQuery.pick({ page: true }) },
  { method: 'post', path: '/api/resources/:id/links', params: idParams, body: resourceLinkInput, success: 201 },
  { method: 'get', path: '/api/resources/:id/links', params: idParams, query: externalResourceQuery.pick({ page: true }) },
  { method: 'delete', path: '/api/resources/:id/links/:linkId', params: resourceLinkParams, body: resourceUnlinkInput },
  { method: 'post', path: '/api/records/:type/:id/files', params: fileParentParams, multipart: true, success: 201 },
  { method: 'post', path: '/api/players/:id/photo-files', params: idParams, multipart: true, success: 201 },
  { method: 'post', path: '/api/files/:id/download', params: idParams, body: fileVersion },
  { method: 'get', path: '/api/files/:id/content', params: idParams },
  { method: 'post', path: '/api/admin/files/cleanup' },
  { method: 'get', path: '/api/admin/files/status' },
  { method: 'get', path: '/api/processing/adapters' },
  { method: 'post', path: '/api/processing/preview', body: processingPreviewInput, success: 201 },
  { method: 'get', path: '/api/processing/:id', params: idParams },
  { method: 'post', path: '/api/processing/:id/approve', params: idParams, body: processingApprovalInput },
  { method: 'post', path: '/api/processing/:id/run', params: idParams, body: fileVersion },
  { method: 'get', path: '/api/campaigns', query: pipelineQuery.pick({ page: true, q: true }) },
  { method: 'post', path: '/api/campaigns', body: campaignCreate, success: 201 },
  { method: 'delete', path: '/api/campaigns/:id', params: idParams, body: versionInput },
  { method: 'get', path: '/api/sponsorship/opportunities', query: pipelineQuery },
  { method: 'post', path: '/api/sponsorship/opportunities', body: opportunityCreate, success: 201 },
  { method: 'get', path: '/api/sponsorship/opportunities/:id', params: idParams },
  { method: 'patch', path: '/api/sponsorship/opportunities/:id/details', params: idParams, body: opportunityDetails },
  { method: 'post', path: '/api/sponsorship/opportunities/:id/membership/preview', params: idParams, body: membershipCommand },
  { method: 'post', path: '/api/sponsorship/opportunities/:id/membership/confirm', params: idParams, body: membershipPlan },
  { method: 'get', path: '/api/sponsorship/opportunities/:id/membership/trash', params: idParams },
  { method: 'delete', path: '/api/sponsorship/opportunities/:id', params: idParams, body: versionInput },
  { method: 'post', path: '/api/sponsorship/opportunities/:id/transition/preview', params: idParams, body: transitionInput },
  { method: 'post', path: '/api/sponsorship/opportunities/:id/transition/confirm', params: idParams, body: transitionPlan },
  { method: 'get', path: '/api/sponsorship/opportunities/:id/history', params: idParams, query: pipelineQuery.pick({ page: true }) },
  { method: 'post', path: '/api/sponsorship/opportunities/:id/reveal', params: idParams, body: pipelineReveal },
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
  ...([['clubs', clubInput], ['players', playerInput], ['people', personInput]] as const).flatMap(([path, schema]): ApiContract[] => [
    { method: 'get', path: `/api/${path}`, query: path === 'clubs' ? clubListQuery : path === 'players' ? playerListQuery : listQuery }, { method: 'post', path: `/api/${path}`, body: schema, success: 201 },
  ]),
  { method: 'get', path: '/api/requests', query: requestListQuery },
  { method: 'post', path: '/api/requests', body: requestInput, success: 201 },
  { method: 'get', path: '/api/requests/contacts', query: requestContactsQuery },
  { method: 'get', path: '/api/requests/:id/suggestions', params: idParams, query: requestPageQuery },
  { method: 'post', path: '/api/requests/:id/matches', params: idParams, body: matchQuery },
  { method: 'post', path: '/api/suggestions', body: suggestionInput, success: 201 },
  { method: 'get', path: '/api/presentations', query: presentationQuery },
  { method: 'get', path: '/api/presentations/:id', params: idParams },
  { method: 'post', path: '/api/presentations', body: presentationCreate, success: 201 },
  { method: 'patch', path: '/api/presentations/:id', params: idParams, body: presentationUpdate },
  { method: 'get', path: '/api/presentation-matrix', query: matrixQuery },
  { method: 'get', path: '/api/clubs/:id/mandates', params: idParams, query: salesQuery },
  { method: 'post', path: '/api/clubs/:id/mandates', params: idParams, body: mandateCreate, success: 201 },
  { method: 'patch', path: '/api/mandates/:id', params: idParams, body: mandateUpdate },
  { method: 'get', path: '/api/clubs/:id/sales', params: idParams, query: salesQuery },
  { method: 'post', path: '/api/clubs/:id/sales', params: idParams, body: saleCreate, success: 201 },
  { method: 'patch', path: '/api/sales/:id', params: idParams, body: saleUpdate },
  { method: 'post', path: '/api/relations', body: relationInput, success: 201 },
  { method: 'get', path: '/api/records/:type/:id', params: entityParams },
  { method: 'patch', path: '/api/records/:type/:id', params: entityParams, body: patchInput },
  { method: 'delete', path: '/api/records/:type/:id', params: entityParams, body: versionInput },
  { method: 'get', path: '/api/records/:type/:id/links', params: entityParams },
  { method: 'get', path: '/api/records/:type/:id/timeline', params: entityParams, query: listQuery },
  { method: 'get', path: '/api/records/:type/:id/delete-preview', params: entityParams },
  { method: 'post', path: '/api/records/:type/:id/reveal', params: entityParams, body: revealInput },
  { method: 'post', path: '/api/records/:type/:id/verify-field', params: entityParams, body: fieldVerification },
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
