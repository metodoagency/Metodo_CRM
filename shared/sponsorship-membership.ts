import { z } from 'zod';

const version = z.number().int().positive();
export const membershipCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('ADD_PLAYER'), version, playerId: z.uuid() }).strict(),
  z.object({ operation: z.literal('REMOVE_PLAYER'), version, linkId: z.uuid() }).strict(),
  z.object({ operation: z.literal('RESTORE_PLAYER'), version, linkId: z.uuid() }).strict(),
  z.object({ operation: z.literal('ADD_CONTACT'), version, brandContactId: z.uuid(), participantId: z.uuid().nullable() }).strict(),
  z.object({ operation: z.literal('REMOVE_CONTACT'), version, linkId: z.uuid() }).strict(),
  z.object({ operation: z.literal('RESTORE_CONTACT'), version, linkId: z.uuid() }).strict(),
  z.object({ operation: z.literal('SET_RESPONSIBLE'), version, personId: z.uuid().nullable() }).strict(),
]);
export const membershipChange = z.object({ model: z.enum(['SponsorshipOpportunity', 'OpportunityPlayer', 'OpportunityContact', 'TrashEntry', 'SponsorshipStageEvent']), operation: z.enum(['CREATE', 'UPDATE', 'TRASH', 'RESTORE', 'DELETE']), id: z.uuid(), label: z.string().min(1), version: version.nullable(), values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }).strict();
export const membershipPlan = z.object({
  ownerId: z.literal('owner'), opportunityId: z.uuid(), command: membershipCommand, graphDigest: z.string().regex(/^[a-f0-9]{64}$/), parentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  allocated: z.object({ linkId: z.uuid(), trashId: z.uuid(), event1Id: z.uuid(), event2Id: z.uuid(), batchId: z.uuid() }).strict(),
  createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), changes: z.array(membershipChange).min(1).max(10), previewToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type MembershipCommand = z.infer<typeof membershipCommand>;
export type MembershipPlan = z.infer<typeof membershipPlan>;
export type MembershipChange = z.infer<typeof membershipChange>;
export type TrashedMembership = { id: string; label: string; model: 'OpportunityPlayer' | 'OpportunityContact'; role: 'BRAND' | 'RESPONSIBLE' | null; personId: string | null; canRestore: boolean };
