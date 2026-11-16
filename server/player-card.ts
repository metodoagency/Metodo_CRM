import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { ageOn, isoDate, istanbulToday } from '../shared/domain.js';
import { playerCardWrite, privateCardInput, type PlayerCard, type PrivateCardFields } from '../shared/player-card.js';
import { activePhotoId } from '../shared/player-photo.js';
import { bestSuitability, evaluateSuitability } from '../shared/player-suitability.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';
import { decrypt } from './crypto.js';

const linkFields = { id: true, name: true, ownerId: true, deletedAt: true } as const;
const cardFields = {
  id: true, name: true, version: true, isExample: true, birthDate: true,
  photo: true, photoSourceUrl: true, photoRightsNote: true, nationalities: true, euPassport: true,
  heightCm: true, weightKg: true, primaryPosition: true, secondaryPositions: true, preferredFoot: true,
  currentClub: { select: linkFields }, currentLeague: { select: linkFields },
  contractEndDate: true, marketValue: true, marketValueCurrency: true, levelScore: true,
} satisfies Prisma.PlayerSelect;

function activeLink(row: { id: string; name: string; ownerId: string; deletedAt: Date | null } | null) {
  return row?.ownerId === live.ownerId && !row.deletedAt ? { id: row.id, name: row.name } : null;
}

export async function registerPlayerCards(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/players/:id/card', async req => {
    const { id } = idParams.parse(req.params);
    const row = await db.player.findFirst({ where: { ...live, id }, select: cardFields });
    if (!row) throw new AppError('NOT_FOUND', 404);
    const card: PlayerCard = {
      id, name: row.name, version: row.version, isExample: row.isExample,
      photo: !!activePhotoId(row), hasBirthDate: row.birthDate !== null,
      nationalities: row.nationalities, euPassport: row.euPassport, heightCm: row.heightCm, weightKg: row.weightKg?.toString() ?? null,
      primaryPosition: row.primaryPosition, secondaryPositions: row.secondaryPositions.filter(position => position !== row.primaryPosition), preferredFoot: row.preferredFoot,
      currentClub: activeLink(row.currentClub), currentLeague: activeLink(row.currentLeague),
      contractEndDate: row.contractEndDate?.toISOString().slice(0, 10) ?? null,
      marketValue: row.marketValue?.toFixed(2) ?? null, marketValueCurrency: row.marketValueCurrency, levelScore: row.levelScore?.toFixed(1) ?? null,
    };
    return card;
  });

  app.patch('/api/players/:id/card', async req => {
    const { id } = idParams.parse(req.params);
    const { version, changes, sourceUrl } = playerCardWrite.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: {
        id: true, version: true, name: true, isExample: true, fieldProvenance: true, primaryPosition: true,
        nationalities: true, euPassport: true, heightCm: true, weightKg: true, secondaryPositions: true, preferredFoot: true,
        currentClubId: true, currentLeagueId: true,
      } });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      if (changes.secondaryPositions?.includes(row.primaryPosition)) throw new AppError('DUPLICATE_POSITION');
      if (changes.currentClubId && !await tx.club.findFirst({ where: { ...live, id: changes.currentClubId }, select: { id: true } })) throw new AppError('NOT_FOUND', 404);
      if (changes.currentLeagueId && !await tx.league.findFirst({ where: { ...live, id: changes.currentLeagueId }, select: { id: true } })) throw new AppError('NOT_FOUND', 404);
      const now = new Date();
      const fields = Object.keys(changes) as (keyof typeof changes)[];
      const fieldProvenance = sourceUrl ? Object.fromEntries(fields.map(key => [key, {
        sourceUrl, sourceType: 'MANUAL', verificationStatus: 'UNVERIFIED', retrievedAt: now.toISOString(),
      }])) : {};
      const updated = await tx.player.update({ where: { ...live, id, version }, data: {
        ...changes,
        fieldProvenance: provenanceFor({ ...changes, fieldProvenance }, row.fieldProvenance, now), version: { increment: 1 },
      }, select: { version: true } });
      const old = Object.fromEntries(fields.map(key => [key, row[key]]));
      await logEvent(tx, { entityType: 'Player', entityId: id, name: row.name, action: 'player_card', isExample: row.isExample, diffs: { old, new: changes } });
      return updated;
    }, { isolationLevel: 'Serializable' });
  });

  app.post('/api/players/:id/card/private', async req => {
    const { id } = idParams.parse(req.params);
    const { version, includeAge, includeFit } = privateCardInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: { version: true, isExample: true, birthDate: true, levelScore: true } });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const date = row.birthDate && (includeAge || row.levelScore !== null) ? decrypt(row.birthDate, 'Player.birthDate') : null;
      const today = istanbulToday();
      const birthDate = date && date <= today && isoDate.safeParse(date).success ? date : null;
      const result: PrivateCardFields = { expiresIn: 60 };
      if (includeAge) result.age = birthDate ? ageOn(birthDate, today) : null;
      if (includeFit) {
        const settings = await tx.userSettings.findFirst({ where: live, select: { leagueTiers: true } });
        const fit = evaluateSuitability(settings?.leagueTiers, row.levelScore?.toNumber() ?? null, birthDate, today);
        const best = bestSuitability(fit);
        result.fit = best ? { tier: best.tier, status: best.status, example: fit.example }
          : fit.results.length ? { status: 'UNSUITABLE', example: fit.example } : null;
      }
      if (result.age != null || result.fit != null) await tx.auditLog.create({ data: {
        actor: 'owner', action: 'reveal', entityType: 'Player', entityId: id, isExample: row.isExample, diffs: { field: 'birthDate' },
      } });
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  });
}
