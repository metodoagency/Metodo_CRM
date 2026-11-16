import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { areaInput, clubLocationInput, clubMapQuery, hasCoordinates, type ClubFilters, type ClubGeography } from '../shared/club-network.js';
import { idParams } from '../shared/contracts.js';
import { normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';

export function clubWhere(filters: ClubFilters, q: string): Prisma.ClubWhereInput {
  const { countryId, countryCode, continentId, regionId, unassigned } = filters;
  if (unassigned && (countryId || countryCode || continentId || regionId)) throw new AppError('INVALID_AREA_FILTER', 400);
  const where: Prisma.ClubWhereInput = { ...live, searchName: { contains: normalizeSearch(q) } };
  if (unassigned) where.country = { isNot: live };
  if (countryId || countryCode || continentId || regionId) {
    where.country = { is: { ...live, id: countryId, isoCode: countryCode ? { equals: countryCode, mode: 'insensitive' } : undefined, continent: continentId ? { is: { ...live, id: continentId } } : undefined } };
  }
  if (regionId) {
    if (!countryId) throw new AppError('COUNTRY_REQUIRED', 400);
    where.region = { is: { ...live, id: regionId, countryId } };
  }
  return where;
}

async function geography(db: PrismaClient): Promise<ClubGeography> {
  const grouped = db.club.groupBy({ by: ['countryId', 'regionId'], where: live, orderBy: [{ countryId: 'asc' }, { regionId: 'asc' }], _count: { _all: true } });
  const [continents, countries, regions, groups] = await db.$transaction([
    db.continent.findMany({ where: live, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.country.findMany({ where: live, select: { id: true, name: true, isoCode: true, continentId: true }, orderBy: { name: 'asc' } }),
    db.region.findMany({ where: { ...live, country: { is: live } }, select: { id: true, name: true, countryId: true }, orderBy: { name: 'asc' } }),
    grouped,
  ], { isolationLevel: 'RepeatableRead' });
  const countryCounts = new Map(countries.map(country => [country.id, 0]));
  const regionCounts = new Map(regions.map(region => [region.id, 0]));
  const regionCountries = new Map(regions.map(region => [region.id, region.countryId]));
  const continentCounts = new Map(continents.map(continent => [continent.id, 0]));
  let total = 0;
  let unassigned = 0;
  for (const group of groups) {
    const count = group._count._all;
    total += count;
    if (!group.countryId || !countryCounts.has(group.countryId)) {
      unassigned += count;
      continue;
    }
    countryCounts.set(group.countryId, countryCounts.get(group.countryId)! + count);
    if (group.regionId && regionCountries.get(group.regionId) === group.countryId) {
      regionCounts.set(group.regionId, regionCounts.get(group.regionId)! + count);
    }
  }
  const countryRows = countries.map(country => {
    const count = countryCounts.get(country.id)!;
    const continentId = country.continentId && continentCounts.has(country.continentId) ? country.continentId : null;
    if (continentId) continentCounts.set(continentId, continentCounts.get(continentId)! + count);
    return { ...country, continentId, count };
  });
  return {
    total, unassigned, countries: countryRows,
    continents: continents.map(continent => ({ ...continent, count: continentCounts.get(continent.id)! })),
    regions: regions.map(region => ({ ...region, count: regionCounts.get(region.id)! })),
  };
}

export async function registerClubNetwork(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/clubs/geography', () => geography(db));
  app.get('/api/clubs/markers', async req => {
    const { q, ...filters } = clubMapQuery.parse(req.query);
    const clubs = await db.club.findMany({
      where: { ...clubWhere(filters, q), lat: { gte: -90, lte: 90 }, lng: { gte: -180, lte: 180 } },
      select: { id: true, name: true, lat: true, lng: true },
      orderBy: { id: 'asc' },
    });
    return { items: clubs.filter(hasCoordinates) };
  });
  app.post('/api/clubs/geography', async (req, reply) => {
    const input = areaInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      let created;
      if (input.type === 'Continent') {
        if (await tx.continent.findFirst({ where: { ...live, name: { equals: input.name, mode: 'insensitive' } } })) throw new AppError('AREA_EXISTS', 409);
        created = await tx.continent.create({ data: { name: input.name, fieldProvenance: provenanceFor({ name: input.name }) } });
      } else if (input.type === 'Country') {
        if (!await tx.continent.findFirst({ where: { ...live, id: input.continentId } })) throw new AppError('NOT_FOUND', 404);
        if (await tx.country.findFirst({ where: { ...live, isoCode: { equals: input.isoCode, mode: 'insensitive' } } })) throw new AppError('AREA_EXISTS', 409);
        const { name, isoCode, continentId } = input;
        created = await tx.country.create({ data: { name, isoCode, continentId, fieldProvenance: provenanceFor({ name, isoCode, continentId }) } });
      } else {
        if (!await tx.country.findFirst({ where: { ...live, id: input.countryId } })) throw new AppError('NOT_FOUND', 404);
        if (await tx.region.findFirst({ where: { ...live, countryId: input.countryId, name: { equals: input.name, mode: 'insensitive' } } })) throw new AppError('AREA_EXISTS', 409);
        const { name, countryId } = input;
        created = await tx.region.create({ data: { name, countryId, fieldProvenance: provenanceFor({ name, countryId }) } });
      }
      await logEvent(tx, { entityType: input.type, entityId: created.id, action: 'create', name: created.name });
      return { id: created.id, name: created.name };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(row);
  });

  app.patch('/api/clubs/:id/location', async req => {
    const { id } = idParams.parse(req.params);
    const { version, ...values } = clubLocationInput.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.club.findFirst({ where: { ...live, id } });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      if (values.countryId && !await tx.country.findFirst({ where: { ...live, id: values.countryId } })) throw new AppError('NOT_FOUND', 404);
      if (values.regionId && (!values.countryId || !await tx.region.findFirst({ where: { ...live, id: values.regionId, countryId: values.countryId } }))) throw new AppError('INVALID_REGION', 400);
      const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => before[key as keyof typeof values] !== value));
      if (!Object.keys(changed).length) return before;
      const row = await tx.club.update({
        where: { ...live, id, version },
        data: { ...values, version: { increment: 1 }, fieldProvenance: provenanceFor(changed, before.fieldProvenance) },
      });
      await logEvent(tx, {
        entityType: 'Club', entityId: id, action: 'update', name: before.name, isExample: before.isExample,
        diffs: { old: Object.fromEntries(Object.keys(changed).map(key => [key, before[key as keyof typeof values]])), new: changed },
      });
      return row;
    }, { isolationLevel: 'Serializable' });
  });
}
