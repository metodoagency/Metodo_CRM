import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { membershipCommand, membershipPlan, type MembershipChange, type MembershipPlan } from '../shared/sponsorship-membership.js';
import { retentionPeriods } from '../shared/retention.js';
import { provenanceFor } from '../shared/provenance.js';
import { hash, sessionCookie } from './auth.js';
import { keyring } from './crypto.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { loadOpportunityGraph, opportunityDigest, opportunityDto } from './sponsorship-pipeline.js';
import { sponsorshipLinkName, writeSponsorshipEvent } from './sponsorship-history.js';

type Graph = Awaited<ReturnType<typeof loadOpportunityGraph>>;
type Link = Graph['players'][number] | Graph['contacts'][number];
type Allocation = MembershipPlan['allocated'];
const active = (r: { ownerId: string; deletedAt: Date | null } | null | undefined) => !!r && r.ownerId === 'owner' && !r.deletedAt;
const stamp = (r: { id: string; ownerId: string; version: number; isExample: boolean; deletedAt?: Date | null } | null) => r && { id: r.id, ownerId: r.ownerId, version: r.version, isExample: r.isExample, deletedAt: r.deletedAt ?? null };
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function sign(session: string, payload: Omit<MembershipPlan, 'previewToken'>) { return createHmac('sha256', Buffer.from(keyring().blind, 'base64')).update('SponsorshipMembership:v1:').update(session).update(JSON.stringify(payload)).digest('hex'); }

async function describe(tx: Tx, id: string, command: MembershipPlan['command'], allocated: Allocation, createdAt: string) {
  const row = await loadOpportunityGraph(tx, id); if (row.version !== command.version) throw new AppError('STALE_VERSION', 409);
  const changes: MembershipChange[] = []; const parents: unknown[] = [];
  const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } }); const periods = retentionPeriods.parse(settings?.retentionDays ?? {}); parents.push(settings ? { settingsVersion: settings.version, periods } : null);
  const push = (model: MembershipChange['model'], operation: MembershipChange['operation'], key: string, label: string, version: number | null, values: MembershipChange['values']) => changes.push({ model, operation, id: key, label, version, values });
  let eventIndex = 0;
  function event(type: 'OpportunityPlayer' | 'OpportunityContact' | 'SponsorshipOpportunity', link: { id: string; name: string; isExample: boolean; stage?: string; outcome?: string }, kind: 'LINK' | 'UNLINK' | 'UPDATE') {
    const eventId = eventIndex++ === 0 ? allocated.event1Id : allocated.event2Id;
    push('SponsorshipStageEvent', 'CREATE', eventId, link.name, null, { opportunityId: id, entityType: type, entityId: link.id, kind, isExample: link.isExample, oldStage: kind === 'UNLINK' ? link.stage ?? null : null, newStage: kind !== 'UNLINK' ? link.stage ?? null : null, oldOutcome: kind === 'UNLINK' ? link.outcome ?? null : null, newOutcome: kind !== 'UNLINK' ? link.outcome ?? null : null });
  }
  async function restore(type: 'OpportunityPlayer' | 'OpportunityContact', link: Link) {
    const trash = await tx.trashEntry.findFirst({ where: { ...live, entityType: type, entityId: link.id } }); if (!trash) throw new AppError('LINKED_RECORDS', 409); parents.push(stamp(trash));
    push(type, 'RESTORE', link.id, link.name, link.version, { deletedAt: null, version: link.version + 1 });
    push('TrashEntry', 'DELETE', trash.id, trash.label, trash.version, { entityType: type, entityId: link.id }); event(type, link, 'LINK');
  }
  function unlink(type: 'OpportunityPlayer' | 'OpportunityContact', link: Link) {
    push(type, 'TRASH', link.id, link.name, link.version, { deletedAt: createdAt, version: link.version + 1 });
    push('TrashEntry', 'CREATE', allocated.trashId, link.name, null, { entityType: type, entityId: link.id, isExample: link.isExample, expiresAt: new Date(Date.parse(createdAt) + (periods[type] ?? 30) * 86400_000).toISOString() }); event(type, link, 'UNLINK');
  }
  async function playerParent(link: Graph['players'][number]) {
    const player = await requireEntity(tx, 'Player', link.playerId); parents.push(stamp(player));
    if (row.players.filter(active).length >= 20) throw new AppError('MEMBERSHIP_LIMIT');
  }
  async function contactParent(link: { brandContactId: string | null; participantId: string | null }) {
    const contact = await tx.brandContact.findFirst({ where: { ...live, id: link.brandContactId ?? '', brandId: row.brandId, brand: live, person: live }, include: { person: true, brand: true } }); if (!contact) throw new AppError('NOT_FOUND', 404);
    parents.push(stamp(contact), stamp(contact.person), stamp(contact.brand));
    if (link.participantId && !row.players.some(p => p.id === link.participantId && active(p) && active(p.player))) throw new AppError('NOT_FOUND', 404);
    if (row.contacts.filter(c => active(c) && c.role === 'BRAND').length >= 20) throw new AppError('MEMBERSHIP_LIMIT');
    return contact;
  }
  if (command.operation === 'ADD_PLAYER') {
    const player = await requireEntity(tx, 'Player', command.playerId); parents.push(stamp(player));
    const prior = row.players.find(p => p.ownerId === 'owner' && p.playerId === player.id); if (prior) throw new AppError(prior.deletedAt ? 'MEMBERSHIP_IN_TRASH' : 'MEMBERSHIP_EXISTS', 409);
    if (row.players.filter(active).length >= 20) throw new AppError('MEMBERSHIP_LIMIT');
    const isExample = row.isExample || player.isExample; const name = sponsorshipLinkName(isExample, player.name);
    push('OpportunityPlayer', 'CREATE', allocated.linkId, name, null, { opportunityId: id, playerId: player.id, isExample, stage: 'RESEARCH', outcome: 'PENDING' }); event('OpportunityPlayer', { id: allocated.linkId, name, isExample, stage: 'RESEARCH', outcome: 'PENDING' }, 'LINK');
  } else if (command.operation === 'REMOVE_PLAYER' || command.operation === 'RESTORE_PLAYER') {
    const link = row.players.find(p => p.id === command.linkId && p.ownerId === 'owner'); if (!link) throw new AppError('NOT_FOUND', 404);
    if (command.operation === 'REMOVE_PLAYER') { if (!active(link)) throw new AppError('STALE_VERSION', 409); unlink('OpportunityPlayer', link); }
    else { if (!link.deletedAt) throw new AppError('STALE_VERSION', 409); await playerParent(link); await restore('OpportunityPlayer', link); }
  } else if (command.operation === 'ADD_CONTACT') {
    const contact = await contactParent(command);
    const prior = row.contacts.find(c => c.ownerId === 'owner' && c.role === 'BRAND' && c.brandContactId === contact.id && c.participantId === command.participantId); if (prior) throw new AppError(prior.deletedAt ? 'MEMBERSHIP_IN_TRASH' : 'MEMBERSHIP_EXISTS', 409);
    const isExample = row.isExample || contact.isExample || contact.person.isExample; const name = sponsorshipLinkName(isExample, contact.person.name);
    push('OpportunityContact', 'CREATE', allocated.linkId, name, null, { opportunityId: id, brandContactId: contact.id, participantId: command.participantId, personId: null, role: 'BRAND', isExample }); event('OpportunityContact', { id: allocated.linkId, name, isExample }, 'LINK');
  } else if (command.operation === 'REMOVE_CONTACT' || command.operation === 'RESTORE_CONTACT') {
    const link = row.contacts.find(c => c.id === command.linkId && c.ownerId === 'owner' && c.role === 'BRAND'); if (!link) throw new AppError('NOT_FOUND', 404);
    if (command.operation === 'REMOVE_CONTACT') { if (!active(link)) throw new AppError('STALE_VERSION', 409); unlink('OpportunityContact', link); }
    else { if (!link.deletedAt) throw new AppError('STALE_VERSION', 409); await contactParent(link); await restore('OpportunityContact', link); }
  } else {
    const before = row.contacts.find(c => c.role === 'RESPONSIBLE' && active(c));
    if (before?.personId === command.personId && row.responsibilityMode === 'PERSON' || !before && !command.personId && row.responsibilityMode === 'OWNER') throw new AppError('EMPTY_PATCH');
    if (before) unlink('OpportunityContact', before);
    if (command.personId) {
      const person = await requireEntity(tx, 'Person', command.personId); parents.push(stamp(person));
      const prior = row.contacts.find(c => c.role === 'RESPONSIBLE' && c.personId === person.id && c.ownerId === 'owner');
      if (prior) { if (!prior.deletedAt) throw new AppError('MEMBERSHIP_EXISTS', 409); await restore('OpportunityContact', prior); }
      else {
        const isExample = row.isExample || person.isExample; const name = sponsorshipLinkName(isExample, person.name);
        push('OpportunityContact', 'CREATE', allocated.linkId, name, null, { opportunityId: id, personId: person.id, brandContactId: null, participantId: null, role: 'RESPONSIBLE', isExample }); event('OpportunityContact', { id: allocated.linkId, name, isExample }, 'LINK');
      }
    } else if (!before) event('SponsorshipOpportunity', row, 'UPDATE');
  }
  push('SponsorshipOpportunity', 'UPDATE', id, row.name, row.version, { version: row.version + 1, ...(command.operation === 'SET_RESPONSIBLE' ? { responsibilityMode: command.personId ? 'PERSON' : 'OWNER' } : {}) });
  return { row, changes, parentDigest: sha(parents) };
}
function nullable(value: string | number | boolean | null | undefined) { return typeof value === 'string' ? value : null; }
async function apply(tx: Tx, plan: Omit<MembershipPlan, 'previewToken'>) {
  for (const change of plan.changes) {
    const values = change.values; const where = { id: change.id, ownerId: 'owner', version: change.version! };
    if (change.model === 'SponsorshipStageEvent') await writeSponsorshipEvent(tx, { id: change.id, batchId: plan.allocated.batchId, opportunityId: plan.opportunityId, entityType: String(values.entityType), entityId: String(values.entityId), name: change.label, isExample: Boolean(values.isExample), kind: String(values.kind), oldStage: nullable(values.oldStage), newStage: nullable(values.newStage), oldOutcome: nullable(values.oldOutcome), newOutcome: nullable(values.newOutcome) });
    else if (change.model === 'TrashEntry') {
      if (change.operation === 'CREATE') await tx.trashEntry.create({ data: { id: change.id, entityType: String(values.entityType), entityId: String(values.entityId), label: change.label, isExample: Boolean(values.isExample), expiresAt: new Date(String(values.expiresAt)) } });
      else if ((await tx.trashEntry.deleteMany({ where: { ...where, deletedAt: null } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    } else if (change.model === 'SponsorshipOpportunity') {
      if ((await tx.sponsorshipOpportunity.updateMany({ where: { ...where, deletedAt: null }, data: { version: { increment: 1 }, ...(values.responsibilityMode ? { responsibilityMode: String(values.responsibilityMode) } : {}) } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    } else if (change.operation === 'CREATE') {
      const common = { id: change.id, name: change.label, opportunityId: plan.opportunityId, isExample: Boolean(values.isExample), fieldProvenance: provenanceFor(values) };
      if (change.model === 'OpportunityPlayer') await tx.opportunityPlayer.create({ data: { ...common, playerId: String(values.playerId) } });
      else await tx.opportunityContact.create({ data: { ...common, role: String(values.role), brandContactId: nullable(values.brandContactId), participantId: nullable(values.participantId), personId: nullable(values.personId) } });
    } else {
      const data = { deletedAt: change.operation === 'TRASH' ? new Date(plan.createdAt) : null, version: { increment: 1 } };
      const args = { where: { ...where, deletedAt: change.operation === 'TRASH' ? null : { not: null } }, data };
      const result = change.model === 'OpportunityPlayer' ? await tx.opportunityPlayer.updateMany(args) : await tx.opportunityContact.updateMany(args); if (result.count !== 1) throw new AppError('STALE_VERSION', 409);
    }
  }
  const row = await loadOpportunityGraph(tx, plan.opportunityId);
  await logEvent(tx, { entityType: 'SponsorshipOpportunity', entityId: row.id, name: row.name, isExample: row.isExample, action: 'update', batchId: plan.allocated.batchId, diffs: { operation: plan.command.operation, changes: plan.changes.map(c => ({ type: c.model, id: c.id, operation: c.operation, values: c.values })) } });
  return opportunityDto(row);
}
export async function registerSponsorshipMembership(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/sponsorship/opportunities/:id/membership/trash', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const row = await loadOpportunityGraph(tx, id); const items: import('../shared/sponsorship-membership.js').TrashedMembership[] = [];
      const ids = [...row.players, ...row.contacts].filter(r => r.ownerId === 'owner' && r.deletedAt).map(r => r.id);
      const entries = await tx.trashEntry.findMany({ where: { ...live, entityType: { in: ['OpportunityPlayer', 'OpportunityContact'] }, entityId: { in: ids } }, select: { entityType: true, entityId: true } });
      const exists = (type: string, key: string) => entries.some(e => e.entityType === type && e.entityId === key);
      for (const p of row.players.filter(p => p.ownerId === 'owner' && p.deletedAt)) items.push({ id: p.id, label: p.name, model: 'OpportunityPlayer', role: null, personId: null, canRestore: exists('OpportunityPlayer', p.id) && active(p.player) && row.players.filter(active).length < 20 });
      for (const c of row.contacts.filter(c => c.ownerId === 'owner' && c.deletedAt)) {
        const parent = c.role === 'RESPONSIBLE' ? active(c.person) && !row.contacts.some(other => other.role === 'RESPONSIBLE' && active(other)) : active(c.brandContact) && active(c.brandContact?.person) && active(c.brandContact?.brand) && c.brandContact?.brandId === row.brandId && (!c.participantId || row.players.some(p => p.id === c.participantId && active(p) && active(p.player))) && row.contacts.filter(c => c.role === 'BRAND' && active(c)).length < 20;
        items.push({ id: c.id, label: c.name, model: 'OpportunityContact', role: c.role as 'BRAND' | 'RESPONSIBLE', personId: c.personId, canRestore: exists('OpportunityContact', c.id) && parent });
      }
      return { items };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/sponsorship/opportunities/:id/membership/preview', async req => {
    const { id } = idParams.parse(req.params); const command = membershipCommand.parse(req.body);
    return db.$transaction(async tx => {
      const allocated = { linkId: randomUUID(), trashId: randomUUID(), event1Id: randomUUID(), event2Id: randomUUID(), batchId: randomUUID() }; const createdAt = new Date().toISOString();
      const result = await describe(tx, id, command, allocated, createdAt);
      const payload = { ownerId: 'owner' as const, opportunityId: id, command, graphDigest: opportunityDigest(result.row), parentDigest: result.parentDigest, allocated, createdAt, expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), changes: result.changes };
      return { ...payload, previewToken: sign(hash(req.cookies[sessionCookie]!), payload) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/sponsorship/opportunities/:id/membership/confirm', async req => {
    const { id } = idParams.parse(req.params); const { previewToken, ...plan } = membershipPlan.parse(req.body); const expected = sign(hash(req.cookies[sessionCookie]!), plan);
    if (id !== plan.opportunityId || !timingSafeEqual(Buffer.from(previewToken, 'hex'), Buffer.from(expected, 'hex'))) throw new AppError('STALE_PREVIEW', 409);
    return db.$transaction(async tx => {
      if (Date.parse(plan.expiresAt) <= Date.now()) throw new AppError('STALE_PREVIEW', 409);
      const result = await describe(tx, id, plan.command, plan.allocated, plan.createdAt);
      if (opportunityDigest(result.row) !== plan.graphDigest || result.parentDigest !== plan.parentDigest || JSON.stringify(result.changes) !== JSON.stringify(plan.changes)) throw new AppError('STALE_PREVIEW', 409);
      return apply(tx, plan);
    }, { isolationLevel: 'Serializable' });
  });
}
