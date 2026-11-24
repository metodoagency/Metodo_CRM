import { z } from 'zod';
import { taskDate } from './tasks.js';

export const opportunityStages = ['RESEARCH', 'CONTACT', 'PROPOSAL', 'NEGOTIATION', 'AGREEMENT', 'ACTIVE', 'COMPLETED', 'LOST', 'CANCELLED'] as const;
export const playerOutcomes = ['PENDING', 'WON', 'LOST', 'WITHDRAWN'] as const;
const version = z.number().int().positive();
const name = z.string().trim().min(2).max(160);
export const campaignFields = z.object({ name, startDate: taskDate.nullable(), endDate: taskDate.nullable() }).strict().refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, 'INVALID_DATE_RANGE');
export const campaignCreate = campaignFields.safeExtend({ isExample: z.boolean().default(false) });
export const opportunityCreate = z.object({
  name, brandId: z.uuid(), campaignId: z.uuid().nullable(), playerIds: z.array(z.uuid()).min(1).max(20),
  brandContactIds: z.array(z.uuid()).max(20), responsiblePersonId: z.uuid().nullable(),
  privateNextAction: z.string().trim().min(1).max(2000).nullable(), nextActionDate: taskDate.nullable(), lastContactDate: taskDate.nullable(), isExample: z.boolean().default(false),
}).strict().refine(v => new Set(v.playerIds).size === v.playerIds.length && new Set(v.brandContactIds).size === v.brandContactIds.length, 'DUPLICATE_LINK');
export const pipelineQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), q: z.string().trim().max(100).default(''), brandId: z.uuid().optional(), stage: z.enum(opportunityStages).optional() }).strict();
export const transitionInput = z.object({ targetType: z.enum(['SponsorshipOpportunity', 'OpportunityPlayer']), targetId: z.uuid(), version, opportunityVersion: version, stage: z.enum(opportunityStages), outcome: z.enum(playerOutcomes).nullable(), privateReason: z.string().trim().min(3).max(2000).nullable() }).strict();
export const transitionPlan = z.object({
  opportunityId: z.uuid(), targetType: transitionInput.shape.targetType, targetId: z.uuid(), version, opportunityVersion: version,
  before: z.object({ stage: z.enum(opportunityStages), outcome: z.enum(playerOutcomes).nullable() }).strict(),
  after: z.object({ stage: z.enum(opportunityStages), outcome: z.enum(playerOutcomes).nullable(), privateReason: transitionInput.shape.privateReason }).strict(),
  graphDigest: z.string().regex(/^[a-f0-9]{64}$/), eventId: z.uuid(), expiresAt: z.iso.datetime(),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TransitionPlan = z.infer<typeof transitionPlan>;
export const pipelineReveal = z.object({ type: z.enum(['SponsorshipOpportunity', 'OpportunityPlayer', 'SponsorshipStageEvent']), id: z.uuid(), version }).strict();
export const opportunityDetails = z.object({
  targetType: transitionInput.shape.targetType, targetId: z.uuid(), version, opportunityVersion: version,
  changes: z.object({ name: name.optional(), privateNextAction: z.string().trim().min(1).max(2000).nullable().optional(), nextActionDate: taskDate.nullable().optional(), lastContactDate: taskDate.nullable().optional() }).strict().refine(v => Object.keys(v).length > 0, 'EMPTY_PATCH'),
}).strict().refine(v => v.targetType !== 'OpportunityPlayer' || v.changes.name === undefined && v.changes.lastContactDate === undefined, 'INVALID_INPUT');
export type PipelineStage = typeof opportunityStages[number];
export type PlayerOutcome = typeof playerOutcomes[number];
export type CampaignRecord = z.infer<typeof campaignFields> & { id: string; version: number; isExample: boolean };
export type PipelinePlayer = { id: string; version: number; player: { id: string; name: string } | null; stage: PipelineStage; outcome: PlayerOutcome; isExample: boolean; hasPrivateNextAction: boolean; nextActionDate: string | null };
export type PipelineContact = { id: string; role: 'BRAND' | 'RESPONSIBLE'; participantId: string | null; person: { id: string; name: string } | null; roleTitle: string | null };
export type OpportunityRecord = {
  id: string; name: string; version: number; scopeVersion: string; isExample: boolean; stage: PipelineStage; brand: { id: string; name: string }; campaign: { id: string; name: string } | null;
  responsibilityMode: 'OWNER' | 'PERSON'; hasPrivateNextAction: boolean; nextActionDate: string | null; lastContactDate: string | null; players: PipelinePlayer[]; contacts: PipelineContact[];
};
export type PipelineEvent = { id: string; entityType: string; entityId: string; kind: string; oldStage: PipelineStage | null; newStage: PipelineStage | null; oldOutcome: PlayerOutcome | null; newOutcome: PlayerOutcome | null; createdAt: string; hasPrivateReason: boolean };
