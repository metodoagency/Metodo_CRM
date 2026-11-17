import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { istanbulToday, normalizeSearch } from '../shared/domain.js';
import { matrixQuery, presentationCreate, presentationQuery, presentationUpdate } from '../shared/presentations.js';
import { AppError, clubContacts, live, logEvent, requireEntity, type Tx } from './core.js';
import { provenanceFor } from '../shared/provenance.js';

const named = { id: true, name: true } as const;
const selection = {
  id: true, version: true, date: true, channel: true, result: true, followUpDate: true, note: true,
  club: { select: named }, person: { select: named }, player: { select: named }, request: { select: named },
} satisfies Prisma.PresentationSelect;
// A deleted linked request can remain in history, but its name is never returned.
export const presentationLive = {
  ...live, club: live, person: live, player: live,
  OR: [{ requestId: null }, { request: live }],
} satisfies Prisma.PresentationWhereInput;
export function overduePresentations(today = istanbulToday()): Prisma.PresentationWhereInput {
  return { ...presentationLive, followUpDate: { lt: new Date(today) }, result: { not: 'REJECTED' } };
}

export async function readPresentations(tx: Tx, input: ReturnType<typeof presentationQuery.parse>) {
  const where = {
    ...(input.overdue === 'true' ? overduePresentations() : presentationLive),
    clubId: input.clubId, personId: input.personId, playerId: input.playerId,
  };
  const [items, total] = await Promise.all([
    tx.presentation.findMany({ where, select: selection, orderBy: [{ followUpDate: 'asc' }, { date: 'desc' }, { id: 'asc' }], take: 50, skip: (input.page - 1) * 50 }),
    tx.presentation.count({ where }),
  ]);
  return { items, total, page: input.page };
}

async function recordPresentation(tx: Tx, row: {
  id: string; name: string; clubId: string; personId: string; playerId: string; requestId: string | null; isExample: boolean;
}, action: 'create' | 'update', diffs: unknown) {
  const batchId = randomUUID();
  const links = [['Club', row.clubId], ['Person', row.personId], ['Player', row.playerId], ['Request', row.requestId]] as const;
  await logEvent(tx, { entityType: 'Presentation', entityId: row.id, name: row.name, action, batchId, diffs, isExample: row.isExample });
  for (const [type, id] of links) if (id) {
    await logEvent(tx, { entityType: type, entityId: id, name: row.name, action, batchId, diffs, isExample: row.isExample });
  }
}

export async function registerPresentations(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/presentations', req => db.$transaction(tx => readPresentations(tx, presentationQuery.parse(req.query)), { isolationLevel: 'RepeatableRead' }));
  app.get('/api/presentations/:id', async req => {
    const { id } = idParams.parse(req.params);
    const row = await db.presentation.findFirst({ where: { ...presentationLive, id }, select: selection });
    if (!row) throw new AppError('NOT_FOUND', 404);
    return row;
  });
  app.post('/api/presentations', async (req, reply) => {
    const input = presentationCreate.parse(req.body);
    const created = await db.$transaction(async tx => {
      const club = await requireEntity(tx, 'Club', input.clubId);
      const player = await requireEntity(tx, 'Player', input.playerId);
      await requireEntity(tx, 'Person', input.personId);
      if (!await tx.relation.findFirst({ where: { ...clubContacts(input.clubId, new Date(input.date)), fromId: input.personId } })) {
        throw new AppError('PERSON_NOT_AT_CLUB');
      }
      if (input.requestId) {
        const request = await requireEntity(tx, 'Request', input.requestId);
        if (!('clubId' in request) || request.clubId !== input.clubId) throw new AppError('INVALID_INPUT');
      }
      const row = await tx.presentation.create({ data: {
        ...input, date: new Date(input.date), followUpDate: new Date(input.followUpDate),
        name: `${player.name} → ${club.name}`, fieldProvenance: provenanceFor(input),
      } });
      await recordPresentation(tx, row, 'create', { presentationId: row.id, channel: row.channel, result: row.result, date: input.date, followUpDate: input.followUpDate });
      return tx.presentation.findUniqueOrThrow({ where: { id: row.id }, select: selection });
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(created);
  });
  app.patch('/api/presentations/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version, ...input } = presentationUpdate.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.presentation.findFirst({ where: { ...presentationLive, id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      const row = await tx.presentation.update({
        where: { ...live, id, version },
        data: {
          ...input, date: new Date(input.date), followUpDate: new Date(input.followUpDate), version: { increment: 1 },
          fieldProvenance: provenanceFor(input, before.fieldProvenance),
        },
      });
      await recordPresentation(tx, row, 'update', {
        presentationId: id,
        old: { date: before.date, channel: before.channel, result: before.result, followUpDate: before.followUpDate },
        new: { date: row.date, channel: row.channel, result: row.result, followUpDate: row.followUpDate },
        noteChanged: before.note !== input.note,
      });
      return tx.presentation.findUniqueOrThrow({ where: { id }, select: selection });
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/presentation-matrix', async req => {
    const { axis, rowPage, playerPage, q, playerQ } = matrixQuery.parse(req.query);
    return db.$transaction(async tx => {
      const relation = { some: presentationLive };
      const rowWhere = { ...live, searchName: { contains: normalizeSearch(q) }, presentations: relation };
      const rows = axis === 'Club'
        ? await tx.club.findMany({ where: rowWhere, select: named, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (rowPage - 1) * 20, take: 21 })
        : await tx.person.findMany({ where: rowWhere, select: named, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (rowPage - 1) * 20, take: 21 });
      const players = await tx.player.findMany({
        where: { ...live, searchName: { contains: normalizeSearch(playerQ) }, presentations: relation },
        select: named, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (playerPage - 1) * 10, take: 11,
      });
      const targets = rows.slice(0, 20); const columns = players.slice(0, 10);
      const targetColumn = axis === 'Club' ? Prisma.sql`p."clubId"` : Prisma.sql`p."personId"`;
      const cells = targets.length && columns.length ? await tx.$queryRaw`
        SELECT DISTINCT ON (${targetColumn}, p."playerId")
          p.id, p.version, ${targetColumn} AS "targetId", p."playerId", p.result, p.date
        FROM "Presentation" p
        JOIN "Club" c ON c.id = p."clubId"
        JOIN "Person" n ON n.id = p."personId"
        JOIN "Player" l ON l.id = p."playerId"
        LEFT JOIN "Request" r ON r.id = p."requestId"
        WHERE p."ownerId" = ${live.ownerId} AND p."deletedAt" IS NULL
          AND c."ownerId" = ${live.ownerId} AND c."deletedAt" IS NULL
          AND n."ownerId" = ${live.ownerId} AND n."deletedAt" IS NULL
          AND l."ownerId" = ${live.ownerId} AND l."deletedAt" IS NULL
          AND (p."requestId" IS NULL OR (r."ownerId" = ${live.ownerId} AND r."deletedAt" IS NULL))
          AND ${targetColumn} IN (${Prisma.join(targets.map(row => Prisma.sql`${row.id}::uuid`))})
          AND p."playerId" IN (${Prisma.join(columns.map(row => Prisma.sql`${row.id}::uuid`))})
        ORDER BY ${targetColumn}, p."playerId", p.date DESC, p."createdAt" DESC, p.id DESC
      ` : [];
      return { rows: targets, players: columns, cells, rowsMore: rows.length > 20, playersMore: players.length > 10 };
    }, { isolationLevel: 'RepeatableRead' });
  });
}
