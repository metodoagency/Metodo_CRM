import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { campaignCreate, campaignPatch, opportunityCreate, opportunityDetails, pipelineQuery, pipelineReveal, transitionInput, transitionPlan, type OpportunityRecord, type PipelineEvent, type TransitionPlan } from '../shared/pipeline.js';
import { normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { idParams, versionInput } from '../shared/contracts.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { decrypt, encrypt, keyring } from './crypto.js';
import { hash, sessionCookie } from './auth.js';
import { opportunityLive, requireOpportunity } from './sponsorship-parent.js';
import { requireExampleName } from './tasks.js';
import { sponsorshipLinkName, writeSponsorshipEvent as stageEvent } from './sponsorship-history.js';

const day = (v: Date | null) => v?.toISOString().slice(0, 10) ?? null;
const include = { brand: true, campaign: true, players: { orderBy: { id: 'asc' }, include: { player: true } }, contacts: { orderBy: { id: 'asc' }, include: { person: true, brandContact: { include: { person: true, brand: true } }, participant: { include: { player: true } } } } } satisfies Prisma.SponsorshipOpportunityInclude;
type Graph = Prisma.SponsorshipOpportunityGetPayload<{ include: typeof include }>;
const available = (v: { ownerId: string; deletedAt: Date | null } | null) => !!v && v.ownerId === 'owner' && !v.deletedAt;
async function graph(tx: Tx, id: string) {
  const row = await tx.sponsorshipOpportunity.findFirst({ where: { ...opportunityLive, id }, include });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
// Covers disappearing children and grandparent changes even when generic purge does not bump the opportunity.
function digest(row: Graph) {
  const stamp = (v: { id: string; ownerId: string; version: number; deletedAt: Date | null; isExample: boolean } | null) => v && { id: v.id, ownerId: v.ownerId, version: v.version, deletedAt: v.deletedAt, isExample: v.isExample };
  return createHash('sha256').update(JSON.stringify({ source: stamp(row), brand: stamp(row.brand), campaign: stamp(row.campaign), players: row.players.map(p => ({ row: stamp(p), player: stamp(p.player) })), contacts: row.contacts.map(c => ({ row: stamp(c), person: stamp(c.person), brandContact: stamp(c.brandContact), brandPerson: stamp(c.brandContact?.person ?? null), brand: stamp(c.brandContact?.brand ?? null), participant: stamp(c.participant), player: stamp(c.participant?.player ?? null) })) })).digest('hex');
}
function dto(row: Graph): OpportunityRecord {
  return {
    id: row.id, name: row.name, version: row.version, scopeVersion: digest(row), isExample: row.isExample, stage: row.stage as OpportunityRecord['stage'], brand: { id: row.brand.id, name: row.brand.name }, campaign: row.campaign ? { id: row.campaign.id, name: row.campaign.name } : null,
    responsibilityMode: row.responsibilityMode as OpportunityRecord['responsibilityMode'], hasPrivateNextAction: row.privateNextAction !== null, nextActionDate: day(row.nextActionDate), lastContactDate: day(row.lastContactDate),
    players: row.players.filter(available).map(p => ({ id: p.id, version: p.version, isExample: p.isExample, player: available(p.player) ? { id: p.player.id, name: p.player.name } : null, stage: p.stage as OpportunityRecord['stage'], outcome: p.outcome as OpportunityRecord['players'][number]['outcome'], hasPrivateNextAction: p.privateNextAction !== null, nextActionDate: day(p.nextActionDate) })),
    contacts: row.contacts.filter(available).map(c => {
      const person = c.role === 'BRAND' ? c.brandContact?.person : c.person;
      const valid = available(person ?? null) && (c.role !== 'BRAND' || available(c.brandContact) && available(c.brandContact!.brand) && c.brandContact!.brandId === row.brandId) && (!c.participantId || available(c.participant) && available(c.participant!.player) && c.participant!.opportunityId === row.id);
      return { id: c.id, version: c.version, brandContactId: c.brandContactId, role: c.role as 'BRAND' | 'RESPONSIBLE', participantId: c.participantId, person: valid && person ? { id: person.id, name: person.name } : null, roleTitle: valid ? c.brandContact?.roleTitle ?? null : null };
    }),
  };
}
function sign(session: string, payload: Omit<TransitionPlan, 'previewToken'>) {
  return createHmac('sha256', Buffer.from(keyring().blind, 'base64')).update('SponsorshipTransition:v1:').update(session).update(JSON.stringify(payload)).digest('hex');
}
function target(row: Graph, type: TransitionPlan['targetType'], id: string, version: number, opportunityVersion: number) {
  if (row.version !== opportunityVersion) throw new AppError('STALE_VERSION', 409);
  const result = type === 'SponsorshipOpportunity' ? row.id === id ? row : null : row.players.find(p => p.id === id && available(p) && available(p.player));
  if (!result) throw new AppError('NOT_FOUND', 404);
  if (result.version !== version) throw new AppError('STALE_VERSION', 409);
  return { row: result, before: { stage: result.stage, outcome: 'outcome' in result ? result.outcome : null } };
}
function validateTransition(input: z.infer<typeof transitionInput>, before: { stage: string; outcome: string | null }) {
  if (input.targetType === 'SponsorshipOpportunity' && input.outcome !== null || input.targetType === 'OpportunityPlayer' && input.outcome === null) throw new AppError('INVALID_INPUT');
  if (input.stage === before.stage && input.outcome === before.outcome) throw new AppError('EMPTY_PATCH');
  if (input.targetType === 'OpportunityPlayer' && (input.stage === 'LOST' && input.outcome !== 'LOST' || input.stage === 'CANCELLED' && input.outcome !== 'WITHDRAWN')) throw new AppError('INVALID_INPUT');
  const terminal = (stage: string, outcome: string | null) => ['COMPLETED', 'LOST', 'CANCELLED'].includes(stage) || outcome !== null && outcome !== 'PENDING';
  if ((terminal(input.stage, input.outcome) || terminal(before.stage, before.outcome)) && !input.privateReason) throw new AppError('REASON_REQUIRED');
}
export async function registerPipeline(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/campaigns', async req => {
    const { page, q } = pipelineQuery.pick({ page: true, q: true }).parse(req.query); const where = { ...live, searchName: { contains: normalizeSearch(q) } };
    return db.$transaction(async tx => ({ items: (await tx.campaign.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50, select: { id: true, name: true, version: true, isExample: true, startDate: true, endDate: true } })).map(r => ({ ...r, startDate: day(r.startDate), endDate: day(r.endDate) })), total: await tx.campaign.count({ where }), page }), { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/campaigns', async (req, reply) => {
    const input = campaignCreate.parse(req.body); requireExampleName(input.isExample, input.name);
    const row = await db.$transaction(async tx => {
      const row = await tx.campaign.create({ data: { ...input, searchName: normalizeSearch(input.name), startDate: input.startDate ? new Date(input.startDate) : null, endDate: input.endDate ? new Date(input.endDate) : null, fieldProvenance: provenanceFor(input) } });
      await logEvent(tx, { entityType: 'Campaign', entityId: row.id, name: row.name, isExample: row.isExample, action: 'create', diffs: { new: input } });
      return { id: row.id, name: row.name, version: row.version, isExample: row.isExample, startDate: day(row.startDate), endDate: day(row.endDate) };
    }, { isolationLevel: 'Serializable' }); return reply.code(201).send(row);
  });
  app.patch('/api/campaigns/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, ...input } = campaignPatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.campaign.findFirst({ where: { ...live, id } }); if (!before) throw new AppError('NOT_FOUND', 404); if (before.version !== version) throw new AppError('STALE_VERSION', 409); requireExampleName(before.isExample, input.name);
      const result = await tx.campaign.updateMany({ where: { ...live, id, version }, data: { ...input, searchName: normalizeSearch(input.name), startDate: input.startDate ? new Date(input.startDate) : null, endDate: input.endDate ? new Date(input.endDate) : null, version: { increment: 1 }, fieldProvenance: provenanceFor(input, before.fieldProvenance) } }); if (result.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'Campaign', entityId: id, name: input.name, isExample: before.isExample, action: 'update', diffs: { old: { name: before.name, startDate: day(before.startDate), endDate: day(before.endDate) }, new: input } });
      return { id, ...input, version: version + 1, isExample: before.isExample };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/sponsorship/opportunities', async req => {
    const { page, q, brandId, stage } = pipelineQuery.parse(req.query); const where = { ...opportunityLive, searchName: { contains: normalizeSearch(q) }, ...(brandId ? { brandId } : {}), ...(stage ? { stage } : {}) };
    return db.$transaction(async tx => ({ items: (await tx.sponsorshipOpportunity.findMany({ where, include, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 })).map(dto), total: await tx.sponsorshipOpportunity.count({ where }), page }), { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/sponsorship/opportunities/:id', async req => { const { id } = idParams.parse(req.params); return db.$transaction(async tx => dto(await graph(tx, id)), { isolationLevel: 'RepeatableRead' }); });
  app.post('/api/sponsorship/opportunities', async (req, reply) => {
    const input = opportunityCreate.parse(req.body);
    const result = await db.$transaction(async tx => {
      const brand = await tx.brand.findFirst({ where: { ...live, id: input.brandId } });
      const campaign = input.campaignId ? await tx.campaign.findFirst({ where: { ...live, id: input.campaignId } }) : null;
      if (!brand || input.campaignId && !campaign) throw new AppError('NOT_FOUND', 404);
      const players = await Promise.all(input.playerIds.map(id => requireEntity(tx, 'Player', id)));
      const contacts = await tx.brandContact.findMany({ where: { ...live, id: { in: input.brandContactIds }, brandId: brand.id, brand: live, person: live }, include: { person: true } });
      if (contacts.length !== input.brandContactIds.length) throw new AppError('NOT_FOUND', 404);
      const responsible = input.responsiblePersonId ? await requireEntity(tx, 'Person', input.responsiblePersonId) : null;
      const isExample = input.isExample || brand.isExample || !!campaign?.isExample; requireExampleName(isExample, input.name);
      const row = await tx.sponsorshipOpportunity.create({ data: { name: input.name, searchName: normalizeSearch(input.name), brandId: brand.id, campaignId: campaign?.id ?? null, isExample, responsibilityMode: responsible ? 'PERSON' : 'OWNER', privateNextAction: input.privateNextAction ? encrypt(input.privateNextAction, 'SponsorshipOpportunity.privateNextAction') : null, nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null, lastContactDate: input.lastContactDate ? new Date(input.lastContactDate) : null, fieldProvenance: provenanceFor(input) } });
      await stageEvent(tx, { opportunityId: row.id, entityType: 'SponsorshipOpportunity', entityId: row.id, name: row.name, isExample, kind: 'CREATE', newStage: row.stage });
      for (const player of players) {
        const childExample = isExample || player.isExample; const name = sponsorshipLinkName(childExample, player.name);
        const child = await tx.opportunityPlayer.create({ data: { name, opportunityId: row.id, playerId: player.id, isExample: childExample, fieldProvenance: provenanceFor({ playerId: player.id }) } });
        await stageEvent(tx, { opportunityId: row.id, entityType: 'OpportunityPlayer', entityId: child.id, name, isExample: childExample, kind: 'LINK', newStage: child.stage, newOutcome: child.outcome });
      }
      for (const contact of contacts) {
        const childExample = isExample || contact.isExample || contact.person.isExample; const name = sponsorshipLinkName(childExample, contact.person.name);
        const link = await tx.opportunityContact.create({ data: { name, opportunityId: row.id, brandContactId: contact.id, role: 'BRAND', isExample: childExample, fieldProvenance: provenanceFor({ brandContactId: contact.id }) } });
        await stageEvent(tx, { opportunityId: row.id, entityType: 'OpportunityContact', entityId: link.id, name, isExample: childExample, kind: 'LINK' });
      }
      if (responsible) {
        const childExample = isExample || responsible.isExample; const name = sponsorshipLinkName(childExample, responsible.name);
        const link = await tx.opportunityContact.create({ data: { name, opportunityId: row.id, personId: responsible.id, role: 'RESPONSIBLE', isExample: childExample, fieldProvenance: provenanceFor({ personId: responsible.id }) } });
        await stageEvent(tx, { opportunityId: row.id, entityType: 'OpportunityContact', entityId: link.id, name, isExample: childExample, kind: 'LINK' });
      }
      await logEvent(tx, { entityType: 'SponsorshipOpportunity', entityId: row.id, name: row.name, isExample, action: 'update', diffs: { brandId: brand.id, campaignId: campaign?.id ?? null, nextActionDate: input.nextActionDate, lastContactDate: input.lastContactDate, privateNextAction: input.privateNextAction } });
      return dto(await graph(tx, row.id));
    }, { isolationLevel: 'Serializable' }); return reply.code(201).send(result);
  });
  app.patch('/api/sponsorship/opportunities/:id/details', async req => {
    const { id } = idParams.parse(req.params); const input = opportunityDetails.parse(req.body);
    return db.$transaction(async tx => {
      const row = await graph(tx, id); const { row: source } = target(row, input.targetType, input.targetId, input.version, input.opportunityVersion);
      const changes = input.changes; requireExampleName(source.isExample, changes.name ?? source.name);
      const common = { ...(changes.privateNextAction !== undefined ? { privateNextAction: changes.privateNextAction === null ? null : encrypt(changes.privateNextAction, `${input.targetType}.privateNextAction`) } : {}), ...(changes.nextActionDate !== undefined ? { nextActionDate: changes.nextActionDate ? new Date(changes.nextActionDate) : null } : {}), fieldProvenance: provenanceFor(changes, source.fieldProvenance), version: { increment: 1 } };
      if (input.targetType === 'OpportunityPlayer') {
        if ((await tx.opportunityPlayer.updateMany({ where: { ...live, id: source.id, version: source.version }, data: common })).count !== 1) throw new AppError('STALE_VERSION', 409);
        if ((await tx.sponsorshipOpportunity.updateMany({ where: { ...live, id, version: row.version }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      } else if ((await tx.sponsorshipOpportunity.updateMany({ where: { ...live, id, version: row.version }, data: { ...common, ...(changes.name ? { name: changes.name, searchName: normalizeSearch(changes.name) } : {}), ...(changes.lastContactDate !== undefined ? { lastContactDate: changes.lastContactDate ? new Date(changes.lastContactDate) : null } : {}) } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: input.targetType, entityId: source.id, name: changes.name ?? source.name, isExample: source.isExample, action: 'update', diffs: { old: Object.fromEntries(Object.keys(changes).map(key => [key, source[key as keyof typeof source]])), new: changes } });
      return dto(await graph(tx, id));
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/sponsorship/opportunities/:id/transition/preview', async req => {
    const { id } = idParams.parse(req.params); const input = transitionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await graph(tx, id); const { before } = target(row, input.targetType, input.targetId, input.version, input.opportunityVersion); validateTransition(input, before);
      const payload = { opportunityId: id, targetType: input.targetType, targetId: input.targetId, version: input.version, opportunityVersion: input.opportunityVersion, before: before as TransitionPlan['before'], after: { stage: input.stage, outcome: input.outcome, privateReason: input.privateReason }, graphDigest: digest(row), eventId: randomUUID(), expiresAt: new Date(Date.now() + 10 * 60000).toISOString() };
      return { ...payload, previewToken: sign(hash(req.cookies[sessionCookie]!), payload) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/sponsorship/opportunities/:id/transition/confirm', async req => {
    const { id } = idParams.parse(req.params); const { previewToken, ...plan } = transitionPlan.parse(req.body);
    const expected = sign(hash(req.cookies[sessionCookie]!), plan);
    if (plan.opportunityId !== id || !timingSafeEqual(Buffer.from(previewToken, 'hex'), Buffer.from(expected, 'hex'))) throw new AppError('STALE_PREVIEW', 409);
    return db.$transaction(async tx => {
      if (Date.parse(plan.expiresAt) <= Date.now()) throw new AppError('STALE_PREVIEW', 409);
      const row = await graph(tx, id); const { row: source, before } = target(row, plan.targetType, plan.targetId, plan.version, plan.opportunityVersion);
      if (digest(row) !== plan.graphDigest || JSON.stringify(before) !== JSON.stringify(plan.before)) throw new AppError('STALE_PREVIEW', 409);
      const input = { ...plan, ...plan.after }; validateTransition(input, before);
      if (plan.targetType === 'OpportunityPlayer') {
        if ((await tx.opportunityPlayer.updateMany({ where: { ...live, id: source.id, version: source.version }, data: { stage: plan.after.stage, outcome: plan.after.outcome!, version: { increment: 1 }, fieldProvenance: provenanceFor({ stage: plan.after.stage, outcome: plan.after.outcome }, source.fieldProvenance) } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      }
      if ((await tx.sponsorshipOpportunity.updateMany({ where: { ...live, id, version: row.version }, data: { version: { increment: 1 }, ...(plan.targetType === 'SponsorshipOpportunity' ? { stage: plan.after.stage, fieldProvenance: provenanceFor({ stage: plan.after.stage }, row.fieldProvenance) } : {}) } })).count !== 1) throw new AppError('STALE_VERSION', 409);
      await stageEvent(tx, { id: plan.eventId, opportunityId: id, entityType: plan.targetType, entityId: source.id, name: source.name, isExample: source.isExample, kind: 'TRANSITION', oldStage: before.stage, oldOutcome: before.outcome, newStage: plan.after.stage, newOutcome: plan.after.outcome, privateReason: plan.after.privateReason });
      return dto(await graph(tx, id));
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/sponsorship/opportunities/:id/history', async req => {
    const { id } = idParams.parse(req.params); const { page } = pipelineQuery.pick({ page: true }).parse(req.query);
    return db.$transaction(async tx => {
      await requireOpportunity(tx, id); const where = { ownerId: 'owner', opportunityId: id };
      const rows = await tx.sponsorshipStageEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 });
      return { items: rows.map(r => ({ id: r.id, label: r.name, entityType: r.entityType, entityId: r.entityId, kind: r.kind, oldStage: r.oldStage, newStage: r.newStage, oldOutcome: r.oldOutcome, newOutcome: r.newOutcome, createdAt: r.createdAt.toISOString(), hasPrivateReason: r.privateReason !== null } as PipelineEvent)), total: await tx.sponsorshipStageEvent.count({ where }), page };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/sponsorship/opportunities/:id/reveal', async req => {
    const { id } = idParams.parse(req.params); const input = pipelineReveal.parse(req.body);
    return db.$transaction(async tx => {
      const row = await graph(tx, id); if (row.version !== input.version) throw new AppError('STALE_VERSION', 409);
      let value: string | null; let name: string; let isExample: boolean; const field = input.type === 'SponsorshipStageEvent' ? 'privateReason' : 'privateNextAction';
      if (input.type === 'SponsorshipStageEvent') {
        const event = await tx.sponsorshipStageEvent.findFirst({ where: { ownerId: 'owner', id: input.id, opportunityId: id } }); if (!event) throw new AppError('NOT_FOUND', 404);
        // History metadata can remain visible, but private reasons require the live typed target chain.
        const valid = event.entityType === 'SponsorshipOpportunity' ? event.entityId === row.id : event.entityType === 'OpportunityPlayer' ? row.players.some(p => p.id === event.entityId && available(p) && available(p.player)) : event.entityType === 'OpportunityContact' ? dto(row).contacts.some(c => c.id === event.entityId && c.person !== null) : false;
        if (!valid) throw new AppError('NOT_FOUND', 404);
        value = event.privateReason; name = event.name; isExample = event.isExample;
      } else {
        const source = input.type === 'SponsorshipOpportunity' ? row.id === input.id ? row : null : row.players.find(p => p.id === input.id && available(p) && available(p.player));
        if (!source) throw new AppError('NOT_FOUND', 404); value = source.privateNextAction; name = source.name; isExample = source.isExample;
      }
      await logEvent(tx, { entityType: input.type, entityId: input.id, action: 'reveal', name, isExample, diffs: { field } });
      return { value: value !== null ? decrypt(value, `${input.type}.${field}`) : null, expiresAt: new Date(Date.now() + 60000).toISOString() };
    }, { isolationLevel: 'RepeatableRead' });
  });
  for (const type of ['Campaign', 'SponsorshipOpportunity'] as const) app.delete(type === 'Campaign' ? '/api/campaigns/:id' : '/api/sponsorship/opportunities/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = type === 'Campaign' ? await tx.campaign.findFirst({ where: { ...live, id } }) : await requireOpportunity(tx, id);
      if (!row) throw new AppError('NOT_FOUND', 404); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const args = { where: { ...live, id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } };
      const changed = type === 'Campaign' ? await tx.campaign.updateMany(args) : await tx.sponsorshipOpportunity.updateMany(args);
      if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } }); const days = retentionPeriods.parse(settings?.retentionDays ?? {})[type] ?? 30;
      await tx.trashEntry.create({ data: { entityType: type, entityId: id, label: row.name, isExample: row.isExample, expiresAt: new Date(Date.now() + days * 86400_000) } });
      await logEvent(tx, { entityType: type, entityId: id, name: row.name, isExample: row.isExample, action: 'delete' }); return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
}

export { graph as loadOpportunityGraph, digest as opportunityDigest, dto as opportunityDto };
