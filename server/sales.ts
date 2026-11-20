import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { istanbulToday } from '../shared/domain.js';
import { mandateCreate, mandateUpdate, saleCreate, salesQuery, saleUpdate } from '../shared/sales.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { provenanceFor } from '../shared/provenance.js';

export function currentMandate(today = istanbulToday()): Prisma.MandateWhereInput {
  return { ...live, club: live, player: live, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } };
}

const named = { id: true, name: true } as const;
const mandateSelect = {
  id: true, name: true, version: true, playerId: true, scope: true, exclusive: true, startDate: true, endDate: true,
  sourceUrl: true, documentRef: true, player: { select: named },
} satisfies Prisma.MandateSelect;
const saleSelect = {
  id: true, version: true, playerId: true, askingAmount: true, currency: true, scope: true, status: true, confidentiality: true,
  player: { select: { ...named, mandateLinks: { where: live, select: { clubId: true, startDate: true, endDate: true } } } },
} satisfies Prisma.SalesListingSelect;

function mandateAudit(row: { name: string; scope: string; startDate: Date; endDate: Date; sourceUrl: string | null; documentRef: string | null; exclusive: boolean }) {
  return { name: row.name, scope: '***', startDate: row.startDate, endDate: row.endDate,
    sourceUrl: row.sourceUrl, documentRef: row.documentRef ? '***' : null, exclusive: row.exclusive };
}

function saleAudit(row: { askingAmount: Prisma.Decimal; currency: string; status: string; scope: string; confidentiality: string }) {
  return { askingAmount: row.confidentiality === 'PRIVATE' ? '***' : row.askingAmount.toFixed(2),
    currency: row.currency, confidentiality: row.confidentiality, status: row.status, scope: '***' };
}

function saleDto(row: Prisma.SalesListingGetPayload<{ select: typeof saleSelect }>, clubId: string, today: string) {
  const authorized = row.player.mandateLinks.some(link => link.clubId === clubId && link.startDate <= new Date(today) && link.endDate >= new Date(today));
  return { ...row, askingAmount: row.askingAmount.toFixed(2), player: { id: row.player.id, name: row.player.name }, authorized };
}

async function logClubRecord(tx: Tx, type: 'Mandate' | 'SalesListing', row: {
  id: string; name: string; clubId: string | null; playerId: string; isExample: boolean;
}, action: 'create' | 'update', diffs: unknown) {
  const batchId = randomUUID();
  for (const [entityType, entityId] of [[type, row.id], ['Club', row.clubId], ['Player', row.playerId]] as const) if (entityId) {
    await logEvent(tx, { entityType, entityId, name: row.name, action, batchId, diffs, isExample: row.isExample });
  }
}

async function requireSaleAuthorization(tx: Tx, clubId: string, playerId: string, status: 'OPEN' | 'CLOSED', exceptId?: string) {
  if (!await tx.mandate.findFirst({ where: { ...currentMandate(), clubId, playerId }, select: { id: true } })) {
    throw new AppError('MANDATE_REQUIRED');
  }
  if (status === 'OPEN' && await tx.salesListing.findFirst({ where: { ...live, clubId, playerId, status: 'OPEN', id: exceptId ? { not: exceptId } : undefined } })) {
    throw new AppError('SALE_EXISTS', 409);
  }
}

export async function registerSales(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/clubs/:id/mandates', async req => {
    const { id } = idParams.parse(req.params); const { page } = salesQuery.parse(req.query);
    return db.$transaction(async tx => {
      await requireEntity(tx, 'Club', id);
      const today = istanbulToday();
      const rows = await tx.mandate.findMany({
        where: { ...live, clubId: id, player: live }, select: mandateSelect,
        orderBy: [{ endDate: 'desc' }, { id: 'asc' }], take: 51, skip: (page - 1) * 50,
      });
      return { items: rows.slice(0, 50).map(row => ({
        ...row, current: row.startDate <= new Date(today) && row.endDate >= new Date(today),
      })), more: rows.length > 50 };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/clubs/:id/mandates', async (req, reply) => {
    const { id } = idParams.parse(req.params); const input = mandateCreate.parse(req.body);
    const row = await db.$transaction(async tx => {
      await requireEntity(tx, 'Club', id); await requireEntity(tx, 'Player', input.playerId);
      const row = await tx.mandate.create({ data: {
        ...input, clubId: id, startDate: new Date(input.startDate), endDate: new Date(input.endDate), fieldProvenance: provenanceFor(input),
      }, select: { ...mandateSelect, isExample: true, clubId: true } });
      await logClubRecord(tx, 'Mandate', row, 'create', { mandateId: row.id, playerId: row.playerId, new: mandateAudit(row) });
      return { id: row.id };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });
  app.patch('/api/mandates/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, ...input } = mandateUpdate.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.mandate.findFirst({ where: { ...live, id, club: live, player: live } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      const row = await tx.mandate.update({ where: { ...live, id, version }, data: {
        ...input, startDate: new Date(input.startDate), endDate: new Date(input.endDate), version: { increment: 1 },
        fieldProvenance: provenanceFor(input, before.fieldProvenance),
      } });
      await logClubRecord(tx, 'Mandate', row, 'update', {
        mandateId: id, old: mandateAudit(before), new: mandateAudit(row), fieldsChanged: Object.keys(input),
      });
      return { id: row.id, version: row.version };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/clubs/:id/sales', async req => {
    const { id } = idParams.parse(req.params); const { page } = salesQuery.parse(req.query);
    return db.$transaction(async tx => {
      await requireEntity(tx, 'Club', id);
      const rows = await tx.salesListing.findMany({
        where: { ...live, clubId: id, player: live }, select: saleSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 51, skip: (page - 1) * 50,
      });
      return { items: rows.slice(0, 50).map(row => saleDto(row, id, istanbulToday())), more: rows.length > 50 };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/clubs/:id/sales', async (req, reply) => {
    const { id } = idParams.parse(req.params); const input = saleCreate.parse(req.body);
    const row = await db.$transaction(async tx => {
      const club = await requireEntity(tx, 'Club', id); const player = await requireEntity(tx, 'Player', input.playerId);
      await requireSaleAuthorization(tx, id, input.playerId, input.status);
      const row = await tx.salesListing.create({ data: {
        ...input, clubId: id, name: `${player.name} → ${club.name}`, interestedClubs: [], fieldProvenance: provenanceFor(input),
      } });
      await logClubRecord(tx, 'SalesListing', row, 'create', { saleId: row.id, playerId: row.playerId, new: saleAudit(row) });
      return { id: row.id };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });
  app.patch('/api/sales/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, ...input } = saleUpdate.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.salesListing.findFirst({ where: { ...live, id, club: live, player: live } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      if (input.status === 'OPEN') await requireSaleAuthorization(tx, before.clubId, before.playerId, input.status, id);
      const row = await tx.salesListing.update({ where: { ...live, id, version }, data: {
        ...input, version: { increment: 1 }, fieldProvenance: provenanceFor(input, before.fieldProvenance),
      } });
      await logClubRecord(tx, 'SalesListing', row, 'update', {
        saleId: id, old: saleAudit(before), new: saleAudit(row), fieldsChanged: Object.keys(input),
      });
      return { id, version: row.version };
    }, { isolationLevel: 'Serializable' });
  });
}
