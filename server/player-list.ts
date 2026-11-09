import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { idParams, versionInput } from '../shared/contracts.js';
import { playerFilters, playerListQuery, playerTagBatch, playerViewInput, type PlayerFilters, type PlayerListRow } from '../shared/player-list.js';
import { activePhotoId } from '../shared/player-photo.js';
import { normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { AppError, live, logEvent } from './core.js';

const listFields = {
  id: true, name: true, version: true, isExample: true, status: true, primaryPosition: true, tags: true, birthDate: true,
  availability: true, levelScore: true, marketValue: true, marketValueCurrency: true, contractEndDate: true, photo: true, photoSourceUrl: true, photoRightsNote: true,
  currentClub: { select: { id: true, name: true, ownerId: true, deletedAt: true } },
  currentLeague: { select: { id: true, name: true, ownerId: true, deletedAt: true } },
} as const;
type Listed = Prisma.PlayerGetPayload<{ select: typeof listFields }>;

export function playerWhere(filters: PlayerFilters): Prisma.PlayerWhereInput {
  if (filters.sort === 'marketValue' && !filters.currency) throw new AppError('CURRENCY_REQUIRED');
  if (filters.scoreMin !== undefined && filters.scoreMax !== undefined && filters.scoreMin > filters.scoreMax) throw new AppError('INVALID_SCORE_RANGE');
  return {
    ...live, searchName: { contains: normalizeSearch(filters.q) }, status: filters.status, primaryPosition: filters.position,
    availability: filters.availability, tags: filters.tag ? { has: filters.tag } : undefined,
    marketValueCurrency: filters.currency,
    currentClub: filters.clubId ? { is: { ...live, id: filters.clubId } } : undefined,
    currentLeague: filters.leagueId ? { is: { ...live, id: filters.leagueId } } : undefined,
    levelScore: filters.scoreMin !== undefined || filters.scoreMax !== undefined ? { gte: filters.scoreMin, lte: filters.scoreMax } : undefined,
    contractEndDate: filters.contractBefore ? { lte: new Date(`${filters.contractBefore}T00:00:00Z`) } : undefined,
  };
}

function listed(row: Listed): PlayerListRow {
  const active = (value: Listed['currentClub']) => value && value.ownerId === live.ownerId && !value.deletedAt ? { id: value.id, name: value.name } : null;
  return {
    id: row.id, name: row.name, version: row.version, isExample: row.isExample, status: row.status, primaryPosition: row.primaryPosition, photo: !!activePhotoId(row),
    tags: row.tags, birthDate: row.birthDate ? '***' : null, availability: row.availability,
    levelScore: row.levelScore?.toFixed(1) ?? null, marketValue: row.marketValue?.toFixed(2) ?? null, marketValueCurrency: row.marketValueCurrency,
    contractEndDate: row.contractEndDate?.toISOString().slice(0, 10) ?? null, currentClub: active(row.currentClub), currentLeague: active(row.currentLeague),
  };
}

function order(filters: PlayerFilters): Prisma.PlayerOrderByWithRelationInput[] {
  const nullable = ['levelScore', 'marketValue', 'contractEndDate'].includes(filters.sort);
  return [{ [filters.sort]: nullable ? { sort: filters.direction, nulls: 'last' } : filters.direction }, { id: 'asc' }];
}

export async function listPlayers(db: PrismaClient, query: unknown) {
  const { page, ...filters } = playerListQuery.parse(query);
  const where = playerWhere(filters);
  const [rows, total] = await db.$transaction([
    db.player.findMany({ where, select: listFields, orderBy: order(filters), take: 50, skip: (page - 1) * 50 }),
    db.player.count({ where }),
  ], { isolationLevel: 'RepeatableRead' });
  return { items: rows.map(listed), total, page };
}

export async function exportPlayers(db: PrismaClient, filters: PlayerFilters) {
  return db.$transaction(async tx => {
    const items = await tx.player.findMany({ where: playerWhere(filters), select: listFields, orderBy: order(filters), take: 10001 });
    if (items.length > 10000) throw new AppError('EXPORT_FILTER_REQUIRED');
    // An explicit allowlist excludes free text, sensitive values, blind indexes
    // and field provenance from both the legacy and filtered export entry points.
    const columns = ['id', 'name', 'primaryPosition', 'status', 'club', 'league', 'levelScore', 'marketValue', 'currency', 'contractEndDate', 'availability', 'tags'];
    const cell = (value: string) => '"' + value.replace(/^[\s]*[=+@\-\t\r]/u, "'$&").replaceAll('"', '""') + '"';
    const rows = items.map(listed).map(row => [row.id, row.name, row.primaryPosition, row.status, row.currentClub?.name ?? '', row.currentLeague?.name ?? '', row.levelScore ?? '', row.marketValue ?? '', row.marketValueCurrency ?? '', row.contractEndDate ?? '', row.availability, row.tags.join(' | ')]);
    await logEvent(tx, { entityType: 'Owner', entityId: 'owner', action: 'export', name: 'Player', diffs: { table: 'Player', count: items.length, sensitive: false } });
    return [columns.map(cell).join(','), ...rows.map(row => row.map(cell).join(','))].join('\r\n');
  }, { isolationLevel: 'RepeatableRead' });
}

export async function registerPlayerLists(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/players/options', async () => {
    const [leagues, availability, tags] = await Promise.all([
      db.league.findMany({ where: live, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      db.player.findMany({ where: live, distinct: ['availability'], select: { availability: true }, orderBy: { availability: 'asc' } }),
      db.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM "Player" WHERE "ownerId" = 'owner' AND "deletedAt" IS NULL ORDER BY tag LIMIT 200`,
    ]);
    return { leagues, availability: availability.map(row => row.availability), tags: tags.map(row => row.tag) };
  });
  app.get('/api/players/export', async (req, reply) => reply.header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', 'attachment; filename="Player.csv"').send(await exportPlayers(db, playerFilters.parse(req.query))));
  app.post('/api/players/tags', async req => {
    const { records, mode, tag } = playerTagBatch.parse(req.body);
    return db.$transaction(async tx => {
      const rows = await tx.player.findMany({ where: { ...live, id: { in: records.map(row => row.id) } }, orderBy: { id: 'asc' } });
      if (rows.length !== records.length || rows.some(row => !records.some(record => record.id === row.id && record.version === row.version))) throw new AppError('STALE_VERSION', 409);
      const batchId = randomUUID();
      for (const row of rows) {
        const tags = mode === 'add' ? [...new Set([...row.tags, tag])] : row.tags.filter(value => value !== tag);
        if (tags.length > 50) throw new AppError('TAG_LIMIT');
        if (tags.join('\0') === row.tags.join('\0')) continue;
        await tx.player.update({ where: { ...live, id: row.id, version: row.version }, data: { tags, version: { increment: 1 }, fieldProvenance: provenanceFor({ tags }, row.fieldProvenance) } });
        await logEvent(tx, { entityType: 'Player', entityId: row.id, action: 'update', name: row.name, batchId, isExample: row.isExample, diffs: { old: { tags: row.tags }, new: { tags } } });
      }
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/players/views', async () => {
    const rows = await db.savedView.findMany({ where: { ...live, tableName: 'Player' }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return rows.map(row => {
      const parsed = playerViewInput.safeParse({ name: row.name, filters: row.filters, columns: row.columns });
      return { id: row.id, version: row.version, ...(parsed.success ? parsed.data : { name: row.name, unavailable: true }) };
    });
  });
  app.post('/api/players/views', async (req, reply) => {
    const input = playerViewInput.parse(req.body);
    playerWhere(input.filters);
    const row = await db.$transaction(async tx => {
      const row = await tx.savedView.create({ data: { ...input, filters: input.filters, tableName: 'Player', sort: { field: input.filters.sort, direction: input.filters.direction } } });
      await logEvent(tx, { entityType: 'SavedView', entityId: row.id, name: row.name, action: 'create' });
      return row;
    });
    return reply.code(201).send({ id: row.id, version: row.version, ...input });
  });
  app.delete('/api/players/views/:id', async req => {
    const { id } = idParams.parse(req.params); const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.savedView.findFirst({ where: { ...live, id, tableName: 'Player' } });
      if (!row || row.version !== version) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
      const days = retentionPeriods.parse(settings?.retentionDays ?? {}).SavedView ?? 30;
      await tx.savedView.update({ where: { ...live, id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await tx.trashEntry.create({ data: { entityType: 'SavedView', entityId: id, label: row.name, expiresAt: new Date(Date.now() + days * 86400_000), isExample: row.isExample } });
      await logEvent(tx, { entityType: 'SavedView', entityId: id, name: row.name, action: 'delete', isExample: row.isExample });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
}
