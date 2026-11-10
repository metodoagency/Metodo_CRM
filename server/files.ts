import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';
import { entityParams, idParams } from '../shared/contracts.js';
import { fileVersion, maxFileBytes } from '../shared/files.js';
import { originalFilename, prepareFile, type MalwareScanner } from './file-validation.js';
import { drainStorageDeletions, newStorageKey, type FileStorage } from './storage.js';

export async function requireAttachment(tx: Tx, id: string) {
  const row = await tx.attachment.findFirst({ where: { ...live, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  const type = entityParams.shape.type.safeParse(row.entityType);
  if (!type.success) throw new AppError('NOT_FOUND', 404);
  await requireEntity(tx, type.data, row.entityId);
  return row;
}
const metadata = (row: { id: string; name: string; mimeType: string; sizeBytes: number; version: number }) => ({ id: row.id, name: row.name, mimeType: row.mimeType, sizeBytes: row.sizeBytes, version: row.version });
export async function registerFiles(app: FastifyInstance, db: PrismaClient, config: Config, storage?: FileStorage, scanner?: MalwareScanner) {
  function available(driver?: string) { if (!storage || driver && storage.driver !== driver) throw new AppError('STORAGE_UNAVAILABLE', 503); return storage; }
  app.get('/api/records/:type/:id/files', async req => {
    const { type, id } = entityParams.parse(req.params); await requireEntity(db, type, id);
    return { items: (await db.attachment.findMany({ where: { ...live, entityType: type, entityId: id }, orderBy: { createdAt: 'desc' }, take: 100 })).map(metadata), uploadAvailable: !!storage };
  });
  app.post('/api/records/:type/:id/files', { bodyLimit: maxFileBytes + 65536 }, async (req, reply) => {
    const { type, id } = entityParams.parse(req.params); const entity = await requireEntity(db, type, id); const target = available();
    if (config.CLAMAV_ENABLED === 'true' && !scanner) throw new AppError('SCANNER_UNAVAILABLE', 503);
    let input: { data: Buffer; mime: string; name: string } | undefined;
    // Exactly one bounded file part; extra files/fields reject the whole upload.
    for await (const part of req.parts({ limits: { files: 1, fields: 0, parts: 1, fileSize: maxFileBytes, headerPairs: 50 } })) {
      if (part.type !== 'file' || part.fieldname !== 'file') throw new AppError('INVALID_FILE');
      const data = await part.toBuffer(); if (part.file.truncated) throw new AppError('FILE_TOO_LARGE', 413);
      input = { data, mime: part.mimetype, name: originalFilename(part.filename) };
    }
    if (!input) throw new AppError('INVALID_FILE');
    const file = await prepareFile(input.data, input.mime, config.CLAMAV_ENABLED === 'true' ? scanner : undefined);
    const key = newStorageKey();
    const cleanup = await db.storageDeletion.create({ data: { driver: target.driver, storageKey: key, notBefore: new Date(Date.now() + 3600_000) } });
    try {
      await target.put(key, file.data, file.mime);
      const row = await db.$transaction(async tx => {
        await requireEntity(tx, type, id);
        const created = await tx.attachment.create({ data: { name: input.name, entityType: type, entityId: id, storageKey: key, storageDriver: target.driver,
          contentHash: file.sha256, mimeType: file.mime, sizeBytes: file.data.length, isExample: entity.isExample, sourceType: 'DOCUMENT' } });
        await tx.storageDeletion.delete({ where: { id: cleanup.id } });
        await logEvent(tx, { entityType: type, entityId: id, action: 'create', name: entity.name, diffs: { attachmentId: created.id }, isExample: entity.isExample });
        return created;
      }, { isolationLevel: 'Serializable' });
      return reply.code(201).send(metadata(row));
    } catch {
      // Durable outbox survives process/database/storage failure; no orphan is lost.
      throw new AppError('UPLOAD_FAILED', 503);
    }
  });
  app.post('/api/files/:id/download', async req => {
    const { id } = idParams.parse(req.params); const { version } = fileVersion.parse(req.body);
    const row = await db.$transaction(async tx => {
      const row = await requireAttachment(tx, id); if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      available(row.storageDriver);
      await logEvent(tx, { entityType: 'Attachment', entityId: id, action: 'reveal', name: 'Attachment', diffs: { field: 'document' }, isExample: row.isExample }); return row;
    });
    const target = available(row.storageDriver);
    return { url: target.signedDownload ? await target.signedDownload(row.storageKey) : `/api/files/${id}/content`, expiresIn: 300 };
  });
  app.get('/api/files/:id/content', async (req, reply) => {
    const { id } = idParams.parse(req.params); const row = await requireAttachment(db, id); const target = available(row.storageDriver);
    // Local downloads always reauthenticate and log; no static directory is served.
    if (target.driver !== 'local') throw new AppError('NOT_FOUND', 404);
    await logEvent(db, { entityType: 'Attachment', entityId: id, action: 'reveal', name: 'Attachment', diffs: { field: 'document' }, isExample: row.isExample });
    return reply.header('content-type', 'application/octet-stream').header('content-disposition', 'attachment; filename="attachment"')
      .header('content-security-policy', "sandbox; default-src 'none'; frame-ancestors https://sites.google.com https://*.google.com")
      .send(await target.read(row.storageKey));
  });
  app.post('/api/admin/files/cleanup', async () => drainStorageDeletions(db, available()));
  app.get('/api/admin/files/status', async () => ({ pending: await db.storageDeletion.count({ where: { ownerId: 'owner' } }), cleanupAvailable: !!storage }));
}
