import type { Tx } from './core.js';
import { AppError, live } from './core.js';
import { writeSponsorshipEvent } from './sponsorship-history.js';

export const opportunityLive = { ...live, brand: live, OR: [{ campaignId: null }, { campaign: live }] };
export async function requireOpportunity(tx: Tx, id: string, version?: number) {
  const row = await tx.sponsorshipOpportunity.findFirst({ where: { ...opportunityLive, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (version !== undefined && row.version !== version) throw new AppError('STALE_VERSION', 409);
  return row;
}
// Restore must check grandparents too, not just direct foreign keys.
export async function validatePipelineRestore(tx: Tx, type: string, row: Record<string, unknown>) {
  if (type === 'SponsorshipOpportunity') {
    if (!await tx.brand.findFirst({ where: { ...live, id: String(row.brandId) } }) || row.campaignId && !await tx.campaign.findFirst({ where: { ...live, id: String(row.campaignId) } })) throw new AppError('LINKED_RECORDS', 409);
    return;
  }
  if (!['OpportunityPlayer', 'OpportunityContact'].includes(type)) return;
  const source = await tx.sponsorshipOpportunity.findFirst({ where: { ...opportunityLive, id: String(row.opportunityId) } });
  if (!source) throw new AppError('LINKED_RECORDS', 409);
  if (type === 'OpportunityContact') {
    if (row.brandContactId && !await tx.brandContact.findFirst({ where: { ...live, id: String(row.brandContactId), brandId: source.brandId, brand: live, person: live } })) throw new AppError('LINKED_RECORDS', 409);
    if (row.personId && !await tx.person.findFirst({ where: { ...live, id: String(row.personId) } })) throw new AppError('LINKED_RECORDS', 409);
    if (row.participantId && !await tx.opportunityPlayer.findFirst({ where: { ...live, id: String(row.participantId), opportunityId: source.id, player: live } })) throw new AppError('LINKED_RECORDS', 409);
  } else if (!await tx.player.findFirst({ where: { ...live, id: String(row.playerId) } })) throw new AppError('LINKED_RECORDS', 409);
  let responsible = false;
  if (type === 'OpportunityContact') {
    const link = await tx.opportunityContact.findFirstOrThrow({ where: { id: String(row.id), ownerId: 'owner' } }); responsible = link.role === 'RESPONSIBLE';
    if (responsible && await tx.opportunityContact.count({ where: { ...live, opportunityId: source.id, role: 'RESPONSIBLE', id: { not: link.id } } })) throw new AppError('LINKED_RECORDS', 409);
    if (!responsible && await tx.opportunityContact.count({ where: { ...live, opportunityId: source.id, role: 'BRAND' } }) >= 20) throw new AppError('MEMBERSHIP_LIMIT');
    await writeSponsorshipEvent(tx, { opportunityId: source.id, entityType: type, entityId: link.id, name: link.name, isExample: link.isExample, kind: 'LINK' });
  } else {
    if (await tx.opportunityPlayer.count({ where: { ...live, opportunityId: source.id } }) >= 20) throw new AppError('MEMBERSHIP_LIMIT');
    const link = await tx.opportunityPlayer.findFirstOrThrow({ where: { id: String(row.id), ownerId: 'owner' } });
    await writeSponsorshipEvent(tx, { opportunityId: source.id, entityType: type, entityId: link.id, name: link.name, isExample: link.isExample, kind: 'LINK', newStage: link.stage, newOutcome: link.outcome });
  }
  await tx.sponsorshipOpportunity.update({ where: { id: source.id, ownerId: 'owner', version: source.version }, data: { version: { increment: 1 }, ...(responsible ? { responsibilityMode: 'PERSON' } : {}) } });
}
