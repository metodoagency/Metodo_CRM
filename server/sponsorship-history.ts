import { randomUUID } from 'node:crypto';
import { provenanceFor } from '../shared/provenance.js';
import { logEvent, type Tx } from './core.js';
import { encrypt } from './crypto.js';

export function sponsorshipLinkName(isExample: boolean, name: string) {
  return isExample && !/^(ÖRNEK|Örnek)/.test(name) ? `Örnek ${name}` : name;
}

export async function writeSponsorshipEvent(tx: Tx, input: { id?: string; batchId?: string; opportunityId: string; entityType: string; entityId: string; name: string; isExample: boolean; kind: string; oldStage?: string | null; newStage?: string | null; oldOutcome?: string | null; newOutcome?: string | null; privateReason?: string | null; links?: Record<string, string | null> }) {
  const batchId = input.batchId ?? randomUUID(); const { privateReason, links, ...details } = input;
  const event = await tx.sponsorshipStageEvent.create({ data: { ...details, batchId, privateReason: privateReason ? encrypt(privateReason, 'SponsorshipStageEvent.privateReason') : null, fieldProvenance: provenanceFor(input) } });
  await logEvent(tx, { ...input, action: input.kind === 'CREATE' ? 'create' : 'update', batchId, diffs: { eventId: event.id, ...(links ? { links } : {}), old: { stage: input.oldStage ?? null, outcome: input.oldOutcome ?? null }, new: { stage: input.newStage ?? null, outcome: input.newOutcome ?? null, ...(privateReason ? { privateReason } : {}) } } });
  return event;
}
