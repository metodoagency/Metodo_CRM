import { z } from 'zod';
import { taskFields } from './tasks.js';

export const presentationRuleInput = z.object({
  version: z.number().int().positive(), enabled: z.boolean(),
  sourceIds: z.array(z.uuid()).max(100).refine(ids => new Set(ids).size === ids.length, 'DUPLICATE_SOURCE'),
}).strict().refine(value => value.enabled || value.sourceIds.length === 0, 'DISABLED_BACKFILL');
export const presentationRulePreview = z.object({
  ownerId: z.literal('owner'), version: z.number().int().positive(), ruleVersion: z.number().int().positive(),
  beforeEnabled: z.boolean(), enabled: z.boolean(), sourceIds: z.array(z.uuid()).max(100),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.iso.datetime(), nonce: z.uuid(),
  tasks: z.array(z.object({ id: z.uuid(), sourceId: z.uuid(), sourceName: z.string(), isExample: z.boolean(), input: taskFields }).strict()).max(100),
  skipped: z.array(z.object({ sourceId: z.uuid(), reason: z.enum(['UNAVAILABLE', 'CONSUMED', 'INVALID_DATE']) }).strict()).max(100),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PresentationRulePreview = z.infer<typeof presentationRulePreview>;
export type PresentationRuleState = { version: number; ruleVersion: number; enabled: boolean; since: string | null };
export type PresentationTaskCandidate = { id: string; name: string; followUpDate: string; consumed: boolean; invalidDate: boolean };
