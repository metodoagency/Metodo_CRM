import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { clubSourceInput, clubSourceList, clubSourceUpdate, type ClubSource } from '../shared/club-sources.js';
import { idParams, versionInput } from '../shared/contracts.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { AppError, live, logEvent, type Tx } from './core.js';

const fields = { id: true, version: true, name: true, type: true, url: true, trustLevel: true, scanMethod: true, linkedClubIds: true } as const;

async function requireClubLinks(tx: Tx, ids: string[]) {
  const clubs = await tx.club.findMany({ where: { ...live, id: { in: ids } }, select: { id: true, name: true, isExample: true } });
  if (clubs.length !== ids.length) throw new AppError('SOURCE_CLUB_UNAVAILABLE', 409);
  return clubs;
}

export async function registerClubSources(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/sources', async req => {
    const { page, clubId } = clubSourceList.parse(req.query);
    return db.$transaction(async tx => {
      const rows = await tx.source.findMany({
        where: { ...live, ...(clubId ? { linkedClubIds: { has: clubId } } : {}) },
        orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 51, select: fields,
      });
      const ids = [...new Set(rows.flatMap(row => row.linkedClubIds))];
      const clubs = await tx.club.findMany({ where: { ...live, id: { in: ids } }, select: { id: true, name: true } });
      const names = new Map(clubs.map(club => [club.id, club]));
      const items: ClubSource[] = rows.slice(0, 50).map(row => ({ ...row, clubs: row.linkedClubIds.flatMap(id => names.get(id) ?? []) }));
      return { items, more: rows.length > 50 };
    }, { isolationLevel: 'RepeatableRead' });
  });

  app.post('/api/sources', async (req, reply) => {
    const input = clubSourceInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const clubs = await requireClubLinks(tx, input.linkedClubIds);
      const isExample = clubs.some(club => club.isExample);
      if (isExample && (clubs.some(club => !club.isExample) || !/^örnek/iu.test(input.name))) throw new AppError('SOURCE_EXAMPLE_LINKS');
      const row = await tx.source.create({ data: { ...input, isExample, sourceUrl: input.url, sourceType: input.type, fieldProvenance: provenanceFor(input) }, select: fields });
      await logEvent(tx, { entityType: 'Source', entityId: row.id, action: 'create', name: row.name, isExample, diffs: { new: input } });
      return row;
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });

  app.patch('/api/sources/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version, ...input } = clubSourceUpdate.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.source.findFirst({ where: { ...live, id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      const added = input.linkedClubIds.filter(clubId => !before.linkedClubIds.includes(clubId));
      const clubs = await requireClubLinks(tx, added);
      if (clubs.some(club => club.isExample !== before.isExample) || before.isExample && !/^örnek/iu.test(input.name)) throw new AppError('SOURCE_EXAMPLE_LINKS');
      const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof input])));
      if (Object.keys(changes).length === 0) return before;
      const row = await tx.source.update({ where: { ...live, id, version }, data: {
        ...input, sourceUrl: input.url, sourceType: input.type, version: { increment: 1 },
        ...(before.url !== input.url || before.type !== input.type ? { verificationStatus: 'UNVERIFIED', retrievedAt: new Date() } : {}),
        fieldProvenance: provenanceFor(changes, before.fieldProvenance),
      }, select: fields });
      await logEvent(tx, { entityType: 'Source', entityId: id, action: 'update', name: row.name, isExample: before.isExample,
        diffs: { old: Object.fromEntries(Object.keys(changes).map(key => [key, before[key as keyof typeof input]])), new: changes } });
      return row;
    }, { isolationLevel: 'Serializable' });
  });

  app.delete('/api/sources/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.source.findFirst({ where: { ...live, id } });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
      const days = retentionPeriods.parse(settings?.retentionDays ?? {}).Source ?? 30;
      await tx.source.update({ where: { ...live, id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await tx.trashEntry.create({ data: { entityType: 'Source', entityId: id, label: row.name, isExample: row.isExample, expiresAt: new Date(Date.now() + days * 86400_000) } });
      await logEvent(tx, { entityType: 'Source', entityId: id, action: 'delete', name: row.name, isExample: row.isExample });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
}
