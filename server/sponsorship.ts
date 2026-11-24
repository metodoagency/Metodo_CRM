import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { idParams, versionInput } from '../shared/contracts.js';
import { normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { brandContactCreate, brandContactDelete, brandContactParams, brandContactPatch, brandCreate, brandPatch, brandQuery } from '../shared/sponsorship.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { requireExampleName } from './tasks.js';
import { sponsorshipLinkName } from './sponsorship-history.js';

const contactLive = { ...live, brand: live, person: live };
const selection = { id: true, name: true, sector: true, website: true, relationStatus: true, version: true, isExample: true,
  _count: { select: { contacts: { where: contactLive } } } } satisfies Prisma.BrandSelect;
const contactSelection = { id: true, version: true, roleTitle: true, startDate: true, endDate: true, person: { select: { id: true, name: true } } } as const;
function contactDto(row: Prisma.BrandContactGetPayload<{ select: typeof contactSelection }>) {
  return { ...row, startDate: row.startDate?.toISOString().slice(0, 10) ?? null, endDate: row.endDate?.toISOString().slice(0, 10) ?? null };
}
async function brand(tx: Tx, id: string, version?: number) {
  const row = await tx.brand.findFirst({ where: { ...live, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (version !== undefined && version !== row.version) throw new AppError('STALE_VERSION', 409);
  return row;
}
async function dto(tx: Tx, id: string) {
  const { _count, ...row } = await tx.brand.findFirstOrThrow({ where: { ...live, id }, select: selection });
  return { ...row, contactCount: _count.contacts };
}
async function bump(tx: Tx, id: string, version: number) {
  if ((await tx.brand.updateMany({ where: { ...live, id, version }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
}
const dates = (details: { roleTitle: string; startDate: string | null; endDate: string | null }) => ({ roleTitle: details.roleTitle, startDate: details.startDate ? new Date(details.startDate) : null, endDate: details.endDate ? new Date(details.endDate) : null });
async function trash(tx: Tx, type: string, row: { id: string; name: string; isExample: boolean }) {
  const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
  const periods = retentionPeriods.parse(settings?.retentionDays ?? {});
  await tx.trashEntry.create({ data: { entityType: type, entityId: row.id, label: row.name, isExample: row.isExample, expiresAt: new Date(Date.now() + (periods[type] ?? 30) * 86400_000) } });
}
async function contactEvents(tx: Tx, row: { id: string; brandId: string; personId: string; name: string; isExample: boolean }, action: 'create' | 'update' | 'delete', diffs: unknown) {
  const batchId = randomUUID();
  for (const [entityType, entityId] of [['Brand', row.brandId], ['Person', row.personId], ['BrandContact', row.id]]) await logEvent(tx, { entityType, entityId, name: row.name, isExample: row.isExample, action, diffs, batchId });
}
export async function registerSponsorship(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/brands', async req => {
    const { page, q } = brandQuery.parse(req.query); const where = { ...live, searchName: { contains: normalizeSearch(q) } };
    return db.$transaction(async tx => {
      const rows = await tx.brand.findMany({ where, select: selection, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 50, skip: (page - 1) * 50 });
      return { items: rows.map(({ _count, ...row }) => ({ ...row, contactCount: _count.contacts })), total: await tx.brand.count({ where }), page };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/brands', async (req, reply) => {
    const input = brandCreate.parse(req.body); requireExampleName(input.isExample, input.name);
    const result = await db.$transaction(async tx => {
      const row = await tx.brand.create({ data: { ...input, searchName: normalizeSearch(`${input.name} ${input.sector}`), fieldProvenance: provenanceFor(input) } });
      await logEvent(tx, { entityType: 'Brand', entityId: row.id, name: row.name, action: 'create', isExample: row.isExample, diffs: { new: input } });
      return dto(tx, row.id);
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(result);
  });
  app.get('/api/brands/:id', async req => {
    const { id } = idParams.parse(req.params); return db.$transaction(async tx => { await brand(tx, id); return dto(tx, id); }, { isolationLevel: 'RepeatableRead' });
  });
  app.patch('/api/brands/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, changes } = brandPatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await brand(tx, id, version); requireExampleName(before.isExample, changes.name ?? before.name);
      await tx.brand.update({ where: { id, ownerId: 'owner', version }, data: { ...changes, version: { increment: 1 }, searchName: normalizeSearch(`${changes.name ?? before.name} ${changes.sector ?? before.sector}`), fieldProvenance: provenanceFor(changes, before.fieldProvenance) } });
      await logEvent(tx, { entityType: 'Brand', entityId: id, name: changes.name ?? before.name, action: 'update', isExample: before.isExample, diffs: { old: Object.fromEntries(Object.keys(changes).map(key => [key, before[key as keyof typeof changes]])), new: changes } });
      return dto(tx, id);
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/brands/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const before = await brand(tx, id, version);
      await tx.brand.update({ where: { id, ownerId: 'owner', version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await trash(tx, 'Brand', before); await logEvent(tx, { entityType: 'Brand', entityId: id, name: before.name, isExample: before.isExample, action: 'delete' });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/brands/:id/contacts', async req => {
    const { id } = idParams.parse(req.params); const { page } = brandQuery.pick({ page: true }).parse(req.query);
    return db.$transaction(async tx => {
      await brand(tx, id); const where = { ...contactLive, brandId: id };
      const rows = await tx.brandContact.findMany({ where, select: contactSelection, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50, skip: (page - 1) * 50 });
      return { items: rows.map(contactDto), total: await tx.brandContact.count({ where }), page };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/brands/:id/contacts', async (req, reply) => {
    const { id } = idParams.parse(req.params); const input = brandContactCreate.parse(req.body);
    const result = await db.$transaction(async tx => {
      const source = await brand(tx, id, input.version); const person = await requireEntity(tx, 'Person', input.personId);
      const prior = await tx.brandContact.findFirst({ where: { ownerId: 'owner', brandId: id, personId: person.id } });
      if (prior) throw new AppError(prior.deletedAt ? 'BRAND_CONTACT_IN_TRASH' : 'BRAND_CONTACT_EXISTS', 409);
      const isExample = source.isExample || person.isExample; const name = sponsorshipLinkName(isExample, person.name); requireExampleName(isExample, name);
      const row = await tx.brandContact.create({ data: { brandId: id, personId: person.id, name, isExample, ...dates(input.details), fieldProvenance: provenanceFor(input.details) } });
      await bump(tx, id, input.version); await contactEvents(tx, row, 'create', { contactId: row.id, brandId: id, personId: person.id, new: input.details });
      return contactDto(await tx.brandContact.findUniqueOrThrow({ where: { id: row.id }, select: contactSelection }));
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(result);
  });
  app.patch('/api/brands/:id/contacts/:contactId', async req => {
    const { id, contactId } = brandContactParams.parse(req.params); const input = brandContactPatch.parse(req.body);
    return db.$transaction(async tx => {
      await brand(tx, id, input.brandVersion);
      const before = await tx.brandContact.findFirst({ where: { ...contactLive, id: contactId, brandId: id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const row = await tx.brandContact.update({ where: { id: contactId, ownerId: 'owner', version: input.version }, data: { ...dates(input.details), version: { increment: 1 }, fieldProvenance: provenanceFor(input.details, before.fieldProvenance) } });
      await bump(tx, id, input.brandVersion); await contactEvents(tx, row, 'update', { contactId, old: { roleTitle: before.roleTitle, startDate: before.startDate, endDate: before.endDate }, new: input.details });
      return contactDto(await tx.brandContact.findUniqueOrThrow({ where: { id: contactId }, select: contactSelection }));
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/brands/:id/contacts/:contactId', async req => {
    const { id, contactId } = brandContactParams.parse(req.params); const input = brandContactDelete.parse(req.body);
    return db.$transaction(async tx => {
      await brand(tx, id, input.brandVersion);
      // An unavailable Person must still allow the owner to remove this historical link.
      const before = await tx.brandContact.findFirst({ where: { ...live, id: contactId, brandId: id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const row = await tx.brandContact.update({ where: { id: contactId, ownerId: 'owner', version: input.version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await bump(tx, id, input.brandVersion); await trash(tx, 'BrandContact', row); await contactEvents(tx, row, 'delete', { contactId, brandId: id, personId: row.personId });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/brands/:id/timeline', async req => {
    const { id } = idParams.parse(req.params); return db.$transaction(async tx => {
      await brand(tx, id); return tx.timelineEvent.findMany({ where: { ...live, entityType: 'Brand', entityId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100, select: { id: true, createdAt: true, summaryTr: true, summaryEn: true } });
    }, { isolationLevel: 'RepeatableRead' });
  });
}
