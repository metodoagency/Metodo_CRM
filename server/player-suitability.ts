import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { istanbulToday } from '../shared/domain.js';
import { evaluateSuitability } from '../shared/player-suitability.js';
import { AppError, live } from './core.js';
import { decrypt } from './crypto.js';

export async function registerPlayerSuitability(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/players/:id/suitability', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const player = await tx.player.findFirst({ where: { ...live, id }, select: { levelScore: true, birthDate: true, isExample: true } });
      if (!player) throw new AppError('NOT_FOUND', 404);
      const settings = await tx.userSettings.findFirst({ where: live, select: { leagueTiers: true } });
      const birthDate = player.birthDate ? decrypt(player.birthDate, 'Player.birthDate') : null;
      const result = evaluateSuitability(settings?.leagueTiers, player.levelScore?.toNumber() ?? null, birthDate, istanbulToday());
      if (result.results.length) await tx.auditLog.create({ data: { actor: 'owner', action: 'reveal', entityType: 'Player', entityId: id,
        isExample: player.isExample, diffs: { field: 'birthDate' } } });
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  });
}
