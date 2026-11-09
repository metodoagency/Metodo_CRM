import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { positionCriteria } from '../shared/domain.js';
import { levelScore, playerScoringInput, positionWeights, scoreHistoryEntry, weightsFor, type PlayerScoring } from '../shared/player-scoring.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';

const scoringFields = { id: true, name: true, isExample: true, version: true, primaryPosition: true, levelScore: true, levelHistory: true, fieldProvenance: true } as const;
const settingsFields = { version: true, levelWeights: true } as const;

export async function registerPlayerScoring(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/players/:id/scoring', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: scoringFields });
      if (!row) throw new AppError('NOT_FOUND', 404);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: settingsFields });
      const weights = weightsFor(positionWeights.parse(settings?.levelWeights ?? {}), row.primaryPosition);
      const history = (Array.isArray(row.levelHistory) ? row.levelHistory : []).flatMap(value => {
        const parsed = scoreHistoryEntry.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      });
      const latest = history.at(-1);
      const result: PlayerScoring = {
        version: row.version, settingsVersion: settings?.version ?? 0, position: row.primaryPosition, weights,
        score: row.levelScore?.toFixed(1) ?? null,
        scores: latest?.position === row.primaryPosition ? latest.scores : null,
        history,
      };
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  });

  app.patch('/api/players/:id/scoring', async req => {
    const { id } = idParams.parse(req.params);
    const input = playerScoringInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: scoringFields });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: settingsFields });
      if ((settings?.version ?? 0) !== input.settingsVersion) throw new AppError('STALE_VERSION', 409);
      if (!Array.isArray(row.levelHistory)) throw new AppError('INVALID_SCORE_HISTORY', 409);
      const position = row.primaryPosition;
      const weights = weightsFor(positionWeights.parse(settings?.levelWeights ?? {}), position);
      const score = levelScore(input.scores, weights);
      const at = new Date().toISOString();
      const levelSubscores = Object.fromEntries(positionCriteria[position].map((criterion, index) => [criterion, input.scores[index]]));
      const history = { position, score, scores: input.scores, weights, at, note: input.note };
      const updated = await tx.player.update({
        where: { ...live, id, version: input.version }, data: {
          levelScore: score, levelSubscores, levelHistory: [...row.levelHistory, history], version: { increment: 1 },
          fieldProvenance: provenanceFor({ levelScore: score, levelSubscores }, row.fieldProvenance, new Date(at)),
        }, select: { version: true },
      });
      await logEvent(tx, { entityType: 'Player', entityId: id, action: 'level_score', name: row.name, isExample: row.isExample,
        diffs: { old: { levelScore: row.levelScore?.toFixed(1) ?? null }, new: { levelScore: score.toFixed(1), levelSubscores, weights, at } } });
      return { version: updated.version, score: score.toFixed(1) };
    }, { isolationLevel: 'Serializable' });
  });
}
