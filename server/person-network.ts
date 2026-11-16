import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { manualSourceUrl } from '../shared/club-sources.js';
import { idParams } from '../shared/contracts.js';
import { ageOn, isoDate, istanbulToday } from '../shared/domain.js';
import { ageParams, personNetworkQuery, tenureCreate, tenureParams, tenureUpdate } from '../shared/person-network.js';
import type { AgeReveal, PersonTenure, WorkedTogether, OverlappingTenures } from '../shared/person-network.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { decrypt } from './crypto.js';

const membership = { ...live, fromType: 'Person', toType: 'Club', relation: 'memberOf' } as const;
const pageSize = 50;
const dateValue = (day: string | null) => day ? new Date(`${day}T00:00:00Z`) : null;
const dayText = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const safeUrl = (url: string | null) => manualSourceUrl.safeParse(url).data ?? null;

async function network(tx: Tx, id: string, page: number, section: ReturnType<typeof personNetworkQuery.parse>['section']) {
  if (!await tx.person.findFirst({ where: { ...live, id }, select: { id: true } })) throw new AppError('NOT_FOUND', 404);
  const today = istanbulToday();
  const paging = Prisma.sql`LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`;
  const ownTenures = Prisma.sql`
    SELECT r.id, r.version, r."toId" AS "clubId", c.name AS "clubName",
      COALESCE(r.role, p.role::text) AS role, r."startDate", r."endDate",
      r."sourceUrl", r."verificationStatus",
      LEAST(CAST(${today} AS date), COALESCE(r."endDate" - 1, CAST(${today} AS date))) AS "lastDay"
    FROM "Relation" r
    JOIN "Club" c ON c.id::text = r."toId" AND c."ownerId" = r."ownerId" AND c."deletedAt" IS NULL
    JOIN "Person" p ON p.id::text = r."fromId" AND p."ownerId" = r."ownerId" AND p."deletedAt" IS NULL
    WHERE r."ownerId" = ${live.ownerId} AND r."deletedAt" IS NULL
      AND r."fromType" = 'Person' AND r."toType" = 'Club' AND r.relation = 'memberOf' AND r."fromId" = ${id}
  `;
  let rows: (PersonTenure | WorkedTogether | OverlappingTenures)[];
  if (section === 'tenures') {
    const result = await tx.$queryRaw<(Omit<PersonTenure, 'startDate' | 'endDate'> & { startDate: Date | null; endDate: Date | null })[]>`
      WITH own AS (${ownTenures})
      SELECT id, version, "clubId", "clubName", role, "startDate", "endDate", "sourceUrl", "verificationStatus"::text
      FROM own ORDER BY "endDate" DESC NULLS FIRST, "startDate" DESC NULLS LAST, id ${paging}
    `;
    rows = result.map(row => ({ ...row, startDate: dayText(row.startDate), endDate: dayText(row.endDate), sourceUrl: safeUrl(row.sourceUrl) }));
  } else if (section === 'workedTogether') {
    rows = await tx.$queryRaw<WorkedTogether[]>`
      WITH own AS (${ownTenures}), periods AS (
        SELECT DISTINCT p.id AS "personId", p.name AS "personName", o."clubId", o."clubName",
          GREATEST(o."startDate", r."startDate") AS "startDate",
          LEAST(o."lastDay", COALESCE(r."endDate" - 1, CAST(${today} AS date))) AS "lastDay"
        FROM own o JOIN "Relation" r ON r."toId" = o."clubId"
        JOIN "Person" p ON p.id::text = r."fromId" AND p."ownerId" = r."ownerId" AND p."deletedAt" IS NULL
        WHERE r."ownerId" = ${live.ownerId} AND r."deletedAt" IS NULL AND r."fromId" <> ${id}
          AND r."fromType" = 'Person' AND r."toType" = 'Club' AND r.relation = 'memberOf'
          AND r."startDate" IS NOT NULL AND o."startDate" IS NOT NULL
      )
      SELECT concat("personId", '/', "clubId", '/', "startDate", '/', "lastDay") AS id,
        "personId", "personName", "clubId", "clubName", "startDate"::text, "lastDay"::text
      FROM periods WHERE "startDate" <= "lastDay" ORDER BY "startDate" DESC, "personName", id ${paging}
    `;
  } else {
    rows = await tx.$queryRaw<OverlappingTenures[]>`
      WITH own AS (${ownTenures}), periods AS (
        SELECT concat(a.id, '/', b.id) AS id, a."clubId" AS "firstClubId", a."clubName" AS "firstClubName", a.role AS "firstRole",
          b."clubId" AS "secondClubId", b."clubName" AS "secondClubName", b.role AS "secondRole",
          GREATEST(a."startDate", b."startDate") AS "startDate", LEAST(a."lastDay", b."lastDay") AS "lastDay"
        FROM own a JOIN own b ON a.id < b.id
        WHERE a."startDate" IS NOT NULL AND b."startDate" IS NOT NULL
      )
      SELECT id, "firstClubId", "firstClubName", "firstRole", "secondClubId", "secondClubName",
        "secondRole", "startDate"::text, "lastDay"::text
      FROM periods WHERE "startDate" <= "lastDay" ORDER BY "startDate" DESC, id ${paging}
    `;
  }
  return { items: rows.slice(0, pageSize), more: rows.length > pageSize };
}

export async function registerPersonNetwork(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/people/:id/network', async req => {
    const { id } = idParams.parse(req.params);
    const { section, page } = personNetworkQuery.parse(req.query);
    return db.$transaction(tx => network(tx, id, page, section), { isolationLevel: 'RepeatableRead' });
  });

  app.post('/api/people/:id/tenures', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { clubId, ...data } = tenureCreate.parse(req.body);
    const tenure = await saveTenure(db, id, clubId, data);
    return reply.code(201).send(tenure);
  });

  app.patch('/api/people/:id/tenures/:relationId', async req => {
    const { id, relationId } = tenureParams.parse(req.params);
    const { version, ...data } = tenureUpdate.parse(req.body);
    return saveTenure(db, id, null, data, { id: relationId, version });
  });

  app.post('/api/records/:type/:id/age', async req => {
    const { type, id } = ageParams.parse(req.params);
    return db.$transaction(async tx => {
      const lookup = { where: { ...live, id }, select: { birthDate: true, isExample: true } } as const;
      const row = type === 'Person' ? await tx.person.findFirst(lookup) : await tx.player.findFirst(lookup);
      if (!row) throw new AppError('NOT_FOUND', 404);
      const result: AgeReveal = { age: null, minor: null, expiresIn: 60 };
      if (!row.birthDate) return result;
      const birthDate = decrypt(row.birthDate, `${type}.birthDate`);
      const today = istanbulToday();
      if (!isoDate.safeParse(birthDate).success || birthDate > today) return result;
      const age = ageOn(birthDate, today);
      await tx.auditLog.create({ data: { actor: 'owner', action: 'reveal', entityType: type, entityId: id, isExample: row.isExample, diffs: { field: 'birthDate' } } });
      return { ...result, age, minor: age < 18 };
    }, { isolationLevel: 'RepeatableRead' });
  });
}

async function saveTenure(db: PrismaClient, personId: string, clubId: string | null, input: Omit<ReturnType<typeof tenureCreate.parse>, 'clubId'>,
  existing?: { id: string; version: number }) {
  return db.$transaction(async tx => {
    const person = await tx.person.findFirst({ where: { ...live, id: personId }, select: { name: true, isExample: true } });
    if (!person) throw new AppError('NOT_FOUND', 404);
    const where = { ...membership, fromId: personId };
    const before = existing ? await tx.relation.findFirst({ where: { ...where, id: existing.id } }) : null;
    if (existing && !before) throw new AppError('NOT_FOUND', 404);
    if (existing && before?.version !== existing.version) throw new AppError('STALE_VERSION', 409);
    const club = await tx.club.findFirst({ where: { ...live, id: before?.toId ?? clubId ?? '' }, select: { id: true, name: true, isExample: true } });
    if (!club) throw new AppError('NOT_FOUND', 404);
    const previous = before && { role: before.role, startDate: dayText(before.startDate), endDate: dayText(before.endDate), sourceUrl: before.sourceUrl };
    if (before && previous?.role === input.role && previous.startDate === input.startDate
      && previous.endDate === input.endDate && previous.sourceUrl === input.sourceUrl) return { id: before.id, version: before.version };
    const now = new Date();
    const dates = { startDate: dateValue(input.startDate), endDate: dateValue(input.endDate) };
    const duplicate = await tx.relation.findFirst({ where: { ...where, toId: club.id, role: input.role, ...dates, ...(before && { id: { not: before.id } }) }, select: { id: true } });
    if (duplicate) throw new AppError('DUPLICATE_TENURE', 409);
    const evidence = { sourceUrl: input.sourceUrl, sourceType: 'MANUAL' as const, verificationStatus: 'UNVERIFIED' as const, retrievedAt: now.toISOString() };
    const fieldProvenance = Object.fromEntries(Object.keys(input).map(field => [field, evidence]));
    const changes = {
      ...input, ...dates, ...evidence, retrievedAt: now,
      fieldProvenance: provenanceFor({ ...input, fieldProvenance }, before?.fieldProvenance, now),
    };
    const isExample = person.isExample || club.isExample || !!before?.isExample;
    const select = { id: true, version: true } as const;
    const after = before
      ? await tx.relation.update({ where: { ...where, id: before.id, version: before.version }, data: { ...changes, version: { increment: 1 } }, select })
      : await tx.relation.create({ data: { ...changes, ...where, toId: club.id, isExample }, select });
    const batchId = randomUUID();
    const diffs = { relationId: after.id, personId, clubId: club.id, old: previous, new: input };
    const action = before ? 'person_tenure_updated' : 'person_tenure_added';
    await logEvent(tx, { entityType: 'Person', entityId: personId, action, name: person.name, isExample, batchId, diffs });
    await logEvent(tx, { entityType: 'Club', entityId: club.id, action, name: club.name, isExample, batchId, diffs });
    return after;
  }, { isolationLevel: 'Serializable' });
}
