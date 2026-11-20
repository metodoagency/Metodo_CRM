import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { istanbulToday, maskSensitive, normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import {
  requestChanges, requestConstraintFields, requestContactsQuery, requestInput, requestListQuery, requestPageQuery, validRequestConstraints,
} from '../shared/transfer-requests.js';
import { matchingSettingsFor, matchQuery, scoreTransferMatch, type MatchPage } from '../shared/transfer-matching.js';
import { AppError, clubContacts, live, logEvent, type Tx } from './core.js';
import { decrypt } from './crypto.js';
import { currentMandate } from './sales.js';

const named = { id: true, name: true, ownerId: true, deletedAt: true } as const;
const linked = { club: { select: named }, requester: { select: named } } as const;
type LinkedName = Prisma.ClubGetPayload<{ select: typeof named }>;
const link = (row: LinkedName | null) => row && row.ownerId === live.ownerId && !row.deletedAt ? { id: row.id, name: row.name } : null;
const listSize = 50;
const matchSize = 25;
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

async function requireContact(tx: Tx, clubId: string, requesterId: string) {
  const [club, person, edge] = await Promise.all([
    tx.club.findFirst({ where: { ...live, id: clubId }, select: { id: true } }),
    tx.person.findFirst({ where: { ...live, id: requesterId }, select: { id: true } }),
    tx.relation.findFirst({ where: { ...clubContacts(clubId), fromId: requesterId }, select: { id: true } }),
  ]);
  if (!club || !person) throw new AppError('NOT_FOUND', 404);
  if (!edge) throw new AppError('PERSON_NOT_AT_CLUB');
}

function forRead(row: Prisma.RequestGetPayload<{ include: typeof linked }>) {
  return maskSensitive({ ...row, club: link(row.club), requester: link(row.requester) });
}

export async function getTransferRequest(db: PrismaClient, id: string) {
  const row = await db.request.findFirst({ where: { ...live, id }, include: linked });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return forRead(row);
}

export async function updateTransferRequest(db: PrismaClient, id: string, version: number, changes: Record<string, unknown>) {
  const input = requestChanges.parse(changes);
  if (!Object.keys(input).some(key => key !== 'fieldProvenance')) throw new AppError('INVALID_INPUT');
  return db.$transaction(async tx => {
    const before = await tx.request.findFirst({ where: { ...live, id } });
    if (!before) throw new AppError('NOT_FOUND', 404);
    if (before.version !== version) throw new AppError('STALE_VERSION', 409);
    const values = { ...before, ...input };
    if (requestConstraintFields.some(key => key in input)
      && !validRequestConstraints(values)) throw new AppError('REQUEST_CONSTRAINTS');
    // Status and criteria remain editable when a historical contact leaves.
    if (values.clubId !== before.clubId || values.requesterId !== before.requesterId) {
      if (!values.requesterId) throw new AppError('PERSON_NOT_AT_CLUB');
      await requireContact(tx, values.clubId, values.requesterId);
    }
    const after = await tx.request.update({
      where: { ...live, id, version },
      data: {
        ...input, deadline: input.deadline === undefined ? undefined : input.deadline === null ? null : asDate(input.deadline),
        fieldProvenance: provenanceFor(input, before.fieldProvenance), version: { increment: 1 },
      },
      include: linked,
    });
    const old = Object.fromEntries(Object.keys(input).map(key => [key, before[key as keyof typeof before]]));
    await logEvent(tx, { entityType: 'Request', entityId: id, name: after.name, action: 'update', isExample: before.isExample,
      diffs: { old, new: input } });
    return forRead(after);
  }, { isolationLevel: 'Serializable' });
}

async function listRequests(db: PrismaClient, query: ReturnType<typeof requestListQuery.parse>) {
  const { page, q, status } = query;
  const skip = (page - 1) * listSize;
  const orderBy = [{ createdAt: 'desc' }, { id: 'asc' }] satisfies Prisma.RequestOrderByWithRelationInput[];
  return db.$transaction(async tx => {
    const where = { ...live, status };
    const search = normalizeSearch(q);
    if (!search) {
      const [rows, total] = await Promise.all([
        tx.request.findMany({ where, include: linked, orderBy, skip, take: listSize }),
        tx.request.count({ where }),
      ]);
      return { items: rows.map(forRead), total, page };
    }
    // Translate the Turkish letters before PostgreSQL's collation-dependent
    // lower(), and use strpos so user input is never a wildcard pattern.
    const filter = Prisma.sql`"ownerId" = ${live.ownerId} AND "deletedAt" IS NULL
      AND (${status ?? null}::"RequestStatus" IS NULL OR "status" = ${status ?? null}::"RequestStatus")
      AND strpos(lower(translate(name, 'ÇĞIİÖŞÜçğıöşü', 'cgiiosucgiosu')), ${search}) > 0`;
    const [ids, count] = await Promise.all([
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Request" WHERE ${filter} ORDER BY "createdAt" DESC, id LIMIT ${listSize} OFFSET ${skip}`,
      tx.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "Request" WHERE ${filter}`,
    ]);
    const rows = await tx.request.findMany({ where: { ...where, id: { in: ids.map(row => row.id) } }, include: linked, orderBy });
    return { items: rows.map(forRead), total: Number(count[0].total), page };
  }, { isolationLevel: 'RepeatableRead' });
}

async function matchPlayers(db: PrismaClient, id: string, input: ReturnType<typeof matchQuery.parse>): Promise<MatchPage> {
  return db.$transaction(async tx => {
    const today = istanbulToday();
    const request = await tx.request.findFirst({ where: { ...live, id } });
    if (!request) throw new AppError('NOT_FOUND', 404);
    const settings = matchingSettingsFor((await tx.userSettings.findFirst({ where: live, select: { matchingWeights: true } }))?.matchingWeights);
    const useAge = settings.weights.age > 0 && (request.ageMin !== null || request.ageMax !== null);
    const useSalary = settings.weights.salary > 0 && request.salaryMax !== null && request.salaryCurrency !== null;
    const useFee = settings.weights.fee > 0 && request.feeMax !== null && request.feeCurrency !== null;
    const players = await tx.player.findMany({
      where: { ...live, searchName: { contains: normalizeSearch(input.q) } },
      orderBy: { id: 'asc' }, take: 10001,
      select: {
        id: true, name: true, isExample: true, primaryPosition: true, secondaryPositions: true,
        preferredFoot: true, euPassport: true, levelScore: true, contractEndDate: true, currentClubId: true,
        birthDate: useAge,
        mandateLinks: useFee ? { where: currentMandate(today), select: { clubId: true } } : false,
        contracts: useSalary ? {
          where: { ...live, isActive: true, type: 'EMPLOYMENT', startDate: { lte: asDate(today) }, endDate: { gte: asDate(today) } },
          select: { id: true, isExample: true, salaryBasis: true, salaryPeriod: true, salaryAmount: true, salaryCurrency: true },
          take: 2,
        } : false,
        salesListings: useFee ? {
          where: { ...live, status: 'OPEN', club: { is: live } },
          select: { clubId: true, askingAmount: true, currency: true },
        } : false,
      },
    });
    if (players.length > 10000) throw new AppError('MATCH_FILTER_REQUIRED');
    const criteria = {
      ...request,
      salaryBudget: request.salaryMax !== null && request.salaryCurrency
        ? { amount: request.salaryMax.toFixed(2), currency: request.salaryCurrency } : null,
      feeBudget: request.feeMax !== null && request.feeCurrency
        ? { amount: request.feeMax.toFixed(2), currency: request.feeCurrency } : null,
    };
    const access: Prisma.AuditLogCreateManyInput[] = [];
    const ranked = players.map(player => {
      const contract = player.contracts?.length === 1 ? player.contracts[0] : null;
      const annualGrossSalary = contract?.salaryBasis === 'GROSS' && contract.salaryPeriod === 'YEAR' && contract.salaryAmount && contract.salaryCurrency
        ? { amount: decrypt(contract.salaryAmount, 'Contract.salaryAmount'), currency: contract.salaryCurrency } : null;
      const listings = player.salesListings?.filter(row => row.clubId === player.currentClubId
        && player.mandateLinks?.some(mandate => mandate.clubId === row.clubId)) ?? [];
      const askingFee = listings.length === 1 ? { amount: listings[0].askingAmount.toFixed(2), currency: listings[0].currency } : null;
      const birthDate = player.birthDate ? decrypt(player.birthDate, 'Player.birthDate') : null;
      if (birthDate !== null) access.push({
        actor: 'owner', action: 'reveal', entityType: 'Player', entityId: player.id, isExample: player.isExample, diffs: { field: 'birthDate' },
      });
      if (contract && annualGrossSalary) access.push({
        actor: 'owner', action: 'reveal', entityType: 'Contract', entityId: contract.id, isExample: contract.isExample, diffs: { field: 'salaryAmount' },
      });
      const result = scoreTransferMatch(criteria, {
        ...player,
        birthDate,
        contractEndDate: day(player.contractEndDate),
        levelScore: player.levelScore?.toNumber(),
        annualGrossSalary,
        askingFee,
      }, today, settings);
      return { id: player.id, name: player.name, isExample: player.isExample, ...result };
    });
    const scoreOrder = (a: MatchPage['items'][number], b: MatchPage['items'][number]) => (b.score ?? -1) - (a.score ?? -1);
    const coverageOrder = (a: MatchPage['items'][number], b: MatchPage['items'][number]) => b.coverage - a.coverage;
    ranked.sort((a, b) => (
      input.sort === 'name' ? a.name.localeCompare(b.name, 'tr')
        : input.sort === 'coverage' ? coverageOrder(a, b) || scoreOrder(a, b) : scoreOrder(a, b) || coverageOrder(a, b)
    ) || a.id.localeCompare(b.id));
    const page = ranked.slice((input.page - 1) * matchSize, input.page * matchSize);
    if (access.length) await tx.auditLog.createMany({ data: access });
    return { items: page, total: ranked.length, page: input.page, asOf: today, expiresIn: 60 };
  }, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}

export async function registerTransferRequests(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/requests', req => listRequests(db, requestListQuery.parse(req.query)));
  app.post('/api/requests', async (req, reply) => {
    const input = requestInput.parse(req.body);
    if (!validRequestConstraints(input)) throw new AppError('REQUEST_CONSTRAINTS');
    const row = await db.$transaction(async tx => {
      await requireContact(tx, input.clubId, input.requesterId);
      const created = await tx.request.create({
        data: { ...input, fieldProvenance: provenanceFor(input), deadline: input.deadline ? asDate(input.deadline) : null },
      });
      await logEvent(tx, { entityType: 'Request', entityId: created.id, name: created.name, action: 'create', diffs: { new: input } });
      return created;
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });
  app.get('/api/requests/contacts', async req => {
    const { clubId } = requestContactsQuery.parse(req.query);
    return db.$transaction(async tx => {
      const club = await tx.club.findFirst({ where: { ...live, id: clubId }, select: { id: true } });
      if (!club) throw new AppError('NOT_FOUND', 404);
      const ids = await tx.relation.findMany({ where: clubContacts(clubId),
        select: { fromId: true }, distinct: ['fromId'] });
      return tx.person.findMany({
        where: { ...live, id: { in: ids.map(row => row.fromId) } },
        select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/requests/:id/suggestions', async req => {
    const { id } = idParams.parse(req.params);
    const { page } = requestPageQuery.parse(req.query);
    return db.$transaction(async tx => {
      if (!await tx.request.findFirst({ where: { ...live, id }, select: { id: true } })) throw new AppError('NOT_FOUND', 404);
      const rows = await tx.suggestion.findMany({
        where: { ...live, requestId: id }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: listSize + 1, skip: (page - 1) * listSize,
        select: {
          id: true, version: true, date: true, whyGoodTransfer: true, matchScore: true,
          player: { select: named }, person: { select: named }, club: { select: named },
        },
      });
      return { items: rows.slice(0, listSize).map(row => ({
        ...row, matchScore: row.matchScore?.toFixed(2) ?? null, date: day(row.date),
        player: link(row.player), person: link(row.person), club: link(row.club),
      })), more: rows.length > listSize };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/requests/:id/matches', req => matchPlayers(db, idParams.parse(req.params).id, matchQuery.parse(req.body)));
}
