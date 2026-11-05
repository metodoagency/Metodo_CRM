import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { listQuery } from '../shared/contracts.js';
import { sensitiveKeys } from '../shared/domain.js';
import { retentionPreviewInput, retentionPurgeInput } from '../shared/retention.js';
import { live } from './core.js';
import { purgeRetention, retentionPreview, retentionTables, validateRetentionPeriods } from './lifecycle.js';

export async function registerRetention(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/admin/retention', async () => {
    const settings = await db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner' }, update: {} });
    return { version: settings.version, periods: validateRetentionPeriods(settings.retentionDays), tables: retentionTables, automaticBusinessDeletion: false };
  });
  app.post('/api/admin/retention/preview', async req => {
    const { table } = retentionPreviewInput.parse(req.body);
    return db.$transaction(async tx => (await retentionPreview(tx, table)).result, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  });
  app.post('/api/admin/retention/purge', async req => purgeRetention(db, retentionPurgeInput.parse(req.body)));
  app.get('/api/admin/access-log', async req => {
    const { page } = listQuery.parse(req.query);
    const where = { ...live, action: 'reveal' };
    const [rows, total] = await Promise.all([db.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50, select: { id: true, actor: true, entityType: true, entityId: true, createdAt: true, diffs: true } }), db.auditLog.count({ where })]);
    return { page, total, items: rows.flatMap(row => {
      const field = row.diffs && typeof row.diffs === 'object' && !Array.isArray(row.diffs) && 'field' in row.diffs ? row.diffs.field : null;
      return typeof field === 'string' && sensitiveKeys.has(field) ? [{ id: row.id, actor: row.actor, entityType: row.entityType, entityId: row.entityId, field, occurredAt: row.createdAt }] : [];
    }) };
  });
}
