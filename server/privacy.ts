import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { acknowledgePrivacy, incidentContactInput, privacyNoticeVersion } from '../shared/privacy.js';
import { AppError, live, logEvent } from './core.js';
import { decrypt, encrypt } from './crypto.js';
import { tr, en } from '../shared/locales.js';

export async function registerPrivacy(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/privacy', async () => {
    const row = await db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner' }, update: {} });
    return { noticeVersion: privacyNoticeVersion, acceptedVersion: row.privacyNoticeVersion, acknowledgedAt: row.privacyAcknowledgedAt, acknowledgementRequired: row.privacyNoticeVersion !== privacyNoticeVersion || !row.privacyAcknowledgedAt, version: row.version, contactConfigured: !!row.breachContact };
  });
  app.post('/api/privacy/acknowledge', async req => {
    const input = acknowledgePrivacy.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.userSettings.findFirst({ where: live });
      if (!before) throw new AppError('NOT_FOUND', 404);
      if (before.privacyNoticeVersion === privacyNoticeVersion && before.privacyAcknowledgedAt) return { ok: true };
      if (before.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const updated = await tx.userSettings.updateMany({ where: { ...live, id: before.id, version: input.version }, data: { privacyNoticeVersion, privacyAcknowledgedAt: new Date(), privacyAcknowledgedLanguage: input.language, language: input.language, version: { increment: 1 } } });
      if (updated.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'UserSettings', entityId: before.id, name: tr.privacyTitle, action: 'update', summaries: { tr: tr.privacyAccepted, en: en.privacyAccepted }, diffs: { noticeVersion: privacyNoticeVersion, language: input.language } });
      return { ok: true };
    });
  });
  app.patch('/api/privacy/incident-contact', async req => {
    const input = incidentContactInput.parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.userSettings.findFirst({ where: live });
      if (!before || before.version !== input.version) throw new AppError('STALE_VERSION', 409);
      const updated = await tx.userSettings.updateMany({ where: { ...live, id: before.id, version: input.version }, data: { breachContact: input.value ? encrypt(input.value, 'UserSettings.breachContact') : null, version: { increment: 1 } } });
      if (updated.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, { entityType: 'UserSettings', entityId: before.id, name: tr.breachContact, action: 'update', diffs: { breachContact: '***', configured: !!input.value } });
      return { ok: true };
    });
  });
  app.post('/api/privacy/incident-contact/reveal', async () => db.$transaction(async tx => {
    const row = await tx.userSettings.findFirst({ where: live });
    if (!row) throw new AppError('NOT_FOUND', 404);
    await logEvent(tx, { entityType: 'UserSettings', entityId: row.id, name: tr.breachContact, action: 'reveal', diffs: { field: 'breachContact' } });
    return { value: row.breachContact ? decrypt(row.breachContact, 'UserSettings.breachContact') : null, expiresIn: 60 };
  }));
}
