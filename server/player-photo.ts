import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { activePhotoId, photoSelection, playerImageMimes } from '../shared/player-photo.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';
import type { FileStorage } from './storage.js';

const photoFields = { id: true, name: true, isExample: true, version: true, photo: true, photoSourceUrl: true, photoRightsNote: true, fieldProvenance: true } as const;
const imageWhere = (playerId: string, id: string) => ({ ...live, id, entityType: 'Player', entityId: playerId,
  mimeType: { in: [...playerImageMimes] }, contentHash: { not: null } });

export async function registerPlayerPhotos(app: FastifyInstance, db: PrismaClient, storage?: FileStorage) {
  app.get('/api/players/:id/photo', { exposeHeadRoute: false }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const player = await db.player.findFirst({ where: { ...live, id }, select: photoFields });
    const photo = player ? activePhotoId(player) : null;
    if (!photo) throw new AppError('NOT_FOUND', 404);
    const file = await db.attachment.findFirst({ where: imageWhere(id, photo) });
    if (!file) throw new AppError('NOT_FOUND', 404);
    if (!storage || file.storageDriver !== storage.driver) throw new AppError('STORAGE_UNAVAILABLE', 503);
    const bytes = await storage.read(file.storageKey);
    await db.$transaction(async tx => {
      const current = await tx.player.findFirst({ where: { ...live, id }, select: photoFields });
      if (!current || activePhotoId(current) !== photo || !await tx.attachment.findFirst({ where: { ...imageWhere(id, photo), version: file.version } })) throw new AppError('NOT_FOUND', 404);
      await tx.auditLog.create({ data: { actor: 'owner', action: 'reveal', entityType: 'Attachment', entityId: file.id, isExample: file.isExample, diffs: { field: 'document' } } });
    }, { isolationLevel: 'RepeatableRead' });
    return reply.type(file.mimeType).header('content-disposition', 'inline').send(bytes);
  });

  app.patch('/api/players/:id/photo', async req => {
    const { id } = idParams.parse(req.params);
    const input = photoSelection.parse(req.body);
    return db.$transaction(async tx => {
      const player = await tx.player.findFirst({ where: { ...live, id }, select: photoFields });
      if (!player) throw new AppError('NOT_FOUND', 404);
      if (player.version !== input.version) throw new AppError('STALE_VERSION', 409);
      if (input.action === 'set' && !await tx.attachment.findFirst({ where: { ...imageWhere(id, input.attachmentId), version: input.attachmentVersion } })) throw new AppError('PHOTO_UNAVAILABLE', 409);
      const changes = input.action === 'set' ? { photo: input.attachmentId, photoSourceUrl: input.sourceUrl, photoRightsNote: input.rightsNote }
        : { photo: null, photoSourceUrl: null, photoRightsNote: null };
      const now = new Date();
      const fieldProvenance = input.action === 'set' ? Object.fromEntries(Object.keys(changes).map(key => [key, {
        sourceUrl: input.sourceUrl, sourceType: 'MANUAL', retrievedAt: now.toISOString(), verificationStatus: 'UNVERIFIED',
      }])) : {};
      const row = await tx.player.update({ where: { ...live, id, version: input.version }, data: { ...changes,
        fieldProvenance: provenanceFor({ ...changes, fieldProvenance }, player.fieldProvenance, now), version: { increment: 1 },
      }, select: { version: true } });
      await logEvent(tx, { entityType: 'Player', entityId: id, action: 'player_photo', name: player.name, isExample: player.isExample,
        diffs: { old: { photo: player.photo, photoSourceUrl: player.photoSourceUrl, photoRightsNote: player.photoRightsNote },
          new: changes } });
      return row;
    }, { isolationLevel: 'Serializable' });
  });
}
