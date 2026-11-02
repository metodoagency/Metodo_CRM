import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { clubInput, playerInput, personInput, requestInput, suggestionInput, relationInput, entityTypes, sensitiveKeys, maskSensitive, normalizeSearch } from '../shared/domain.js';
import { AppError, live, logEvent, requireEntity, softDelete } from './core.js';
import { createSuggestion } from './suggestions.js';
import { encrypt, decrypt, blindIndex, csrfToken } from './crypto.js';
import { sessionCookie } from './auth.js';
import { tr, en } from '../shared/locales.js';

const idParams = z.object({ id: z.string().uuid() });
const entityParams = z.object({ type: z.enum(entityTypes), id: z.string().uuid() });
const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(100).default(''), status: z.enum(['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED']).optional() }).strict();
const masked = (row: unknown) => maskSensitive(row);

export async function registerRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/me', async req => ({ id: 'owner', csrfToken: csrfToken(req.cookies[sessionCookie]!) }));
  app.get('/api/settings', async () => db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner' }, update: {} }));
  app.patch('/api/settings', async req => {
    const { version, ...data } = z.object({ version: z.number().int().positive(), language: z.enum(['tr', 'en']).optional(), theme: z.enum(['dark', 'light']).optional() }).strict().parse(req.body);
    return db.$transaction(async tx => {
      const before = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
      if (!before || before.version !== version) throw new AppError('STALE_VERSION', 409);
      const after = await tx.userSettings.update({ where: { ownerId: 'owner', version }, data: { ...data, version: { increment: 1 } } });
      await logEvent(tx, { entityType: 'UserSettings', entityId: after.id, action: 'update', name: tr.settings, summaries: { tr: tr.timeline_update.replace('{name}', tr.settings), en: en.timeline_update.replace('{name}', en.settings) }, diffs: { old: before, new: data } });
      return after;
    });
  });
  app.get('/api/overview', async () => {
    const [clubs, players, requests, proposals, tasks, meetings, recent, notifications] = await Promise.all([
      db.club.count({ where: live }), db.player.count({ where: live }), db.request.count({ where: { ...live, status: { not: 'CLOSED' } } }),
      db.updateProposal.count({ where: { ...live, approvalStatus: 'PENDING' } }),
      db.task.findMany({ where: { ...live, status: 'OPEN' }, orderBy: { dueDate: 'asc' }, take: 5 }),
      db.meeting.findMany({ where: { ...live, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, orderBy: { date: 'asc' }, take: 4 }),
      db.timelineEvent.findMany({ where: live, orderBy: { createdAt: 'desc' }, take: 6 }), db.notification.count({ where: { ...live, status: 'NEW' } }),
    ]);
    return { clubs, players, requests, proposals, tasks, meetings, recent, notifications };
  });
  app.get('/api/clubs', async req => {
    const { page, q } = listQuery.parse(req.query);
    const where = { ...live, searchName: { contains: normalizeSearch(q) } };
    const [items, total] = await db.$transaction([db.club.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * 50, take: 50 }), db.club.count({ where })]);
    return { items, total, page };
  });
  app.post('/api/clubs', async (req, reply) => {
    const data = clubInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const row = await tx.club.create({ data: { ...data, searchName: normalizeSearch(data.name) } });
      await logEvent(tx, { entityType: 'Club', entityId: row.id, action: 'create', name: row.name, diffs: { new: data } });
      return row;
    });
    return reply.code(201).send(row);
  });
  app.get('/api/players', async req => {
    const { page, q, status } = listQuery.parse(req.query);
    const where = { ...live, searchName: { contains: normalizeSearch(q) }, ...(status ? { status } : {}) };
    const [items, total] = await db.$transaction([db.player.findMany({ where, include: { currentClub: true }, orderBy: { name: 'asc' }, skip: (page - 1) * 50, take: 50 }), db.player.count({ where })]);
    return { items: items.map(masked), total, page };
  });
  app.post('/api/players', async (req, reply) => {
    const input = playerInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      if (input.currentClubId) await requireEntity(tx, 'Club', input.currentClubId);
      const row = await tx.player.create({ data: { ...input, birthDate: input.birthDate ? encrypt(input.birthDate, 'Player.birthDate') : undefined, birthDateIndex: input.birthDate ? blindIndex(input.birthDate) : undefined, searchName: normalizeSearch(input.name) } });
      await logEvent(tx, { entityType: 'Player', entityId: row.id, action: 'create', name: row.name, diffs: { new: input } });
      return row;
    });
    return reply.code(201).send(masked(row));
  });
  app.get('/api/people', async req => {
    const { page, q } = listQuery.parse(req.query);
    const where = { ...live, searchName: { contains: normalizeSearch(q) } };
    return { items: (await db.person.findMany({ where, skip: (page - 1) * 50, take: 50, orderBy: { name: 'asc' } })).map(masked), total: await db.person.count({ where }), page };
  });
  app.post('/api/people', async (req, reply) => {
    const data = personInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const row = await tx.person.create({ data: { ...data, searchName: normalizeSearch(data.name) } });
      await logEvent(tx, { entityType: 'Person', entityId: row.id, name: row.name, action: 'create' }); return row;
    });
    return reply.code(201).send(masked(row));
  });
  app.get('/api/requests', async req => {
    const { page } = listQuery.parse(req.query);
    return { items: (await db.request.findMany({ where: live, include: { club: true, requester: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 })).map(masked), total: await db.request.count({ where: live }), page };
  });
  app.post('/api/requests', async (req, reply) => {
    const input = requestInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      await requireEntity(tx, 'Club', input.clubId); await requireEntity(tx, 'Person', input.requesterId);
      if (!await tx.relation.findFirst({ where: { ...live, fromType: 'Person', fromId: input.requesterId, toType: 'Club', toId: input.clubId, endDate: null, relation: { in: ['memberOf', 'contactOf'] } } })) throw new AppError('PERSON_NOT_AT_CLUB');
      const row = await tx.request.create({ data: { ...input, deadline: input.deadline ? new Date(input.deadline) : undefined } });
      await logEvent(tx, { entityType: 'Request', entityId: row.id, name: row.name, action: 'create' }); return row;
    });
    return reply.code(201).send(row);
  });
  app.post('/api/suggestions', async (req, reply) => reply.code(201).send(await createSuggestion(db, suggestionInput.parse(req.body))));
  app.get('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    return masked(await requireEntity(db, type, id));
  });
  app.patch('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    const schema = type === 'Club' ? clubInput.partial() : type === 'Player' ? playerInput.partial() : type === 'Person' ? personInput.partial() : requestInput.partial();
    const { version, changes } = z.object({ version: z.number().int().positive(), changes: z.record(z.string(), z.unknown()) }).strict().parse(req.body);
    const input = schema.parse(changes);
    return db.$transaction(async tx => {
      const before = await requireEntity(tx, type, id);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      // Relationship changes use domain flows; this generic editor supports only
      // safe identity and status fields, with explicit schema validation.
      const data: Record<string, unknown> = { ...input, version: { increment: 1 } };
      if ('currentClubId' in input && input.currentClubId) await requireEntity(tx, 'Club', input.currentClubId);
      if ('clubId' in input && input.clubId) await requireEntity(tx, 'Club', input.clubId);
      if ('requesterId' in input && input.requesterId) await requireEntity(tx, 'Person', input.requesterId);
      if ('birthDate' in input && input.birthDate) { data.birthDate = encrypt(input.birthDate, `${type}.birthDate`); data.birthDateIndex = blindIndex(input.birthDate); }
      if ('name' in input && input.name && type !== 'Request') data.searchName = normalizeSearch(input.name);
      if ('deadline' in input && input.deadline) data.deadline = new Date(input.deadline);
      const where = { id, version };
      const after = type === 'Club' ? await tx.club.update({ where, data }) : type === 'Player' ? await tx.player.update({ where, data }) : type === 'Person' ? await tx.person.update({ where, data }) : await tx.request.update({ where, data });
      await logEvent(tx, { entityType: type, entityId: id, name: before.name, action: 'update', diffs: { old: before, new: input }, isExample: before.isExample });
      return masked(after);
    });
  });
  app.get('/api/records/:type/:id/links', async req => {
    const { type, id } = entityParams.parse(req.params); await requireEntity(db, type, id);
    const links = await db.relation.findMany({ where: { ...live, OR: [{ fromType: type, fromId: id }, { toType: type, toId: id }] }, orderBy: { createdAt: 'desc' } });
    return Promise.all(links.map(async link => {
      const direction = link.fromType === type && link.fromId === id ? 'outgoing' : 'incoming';
      const targetType = direction === 'outgoing' ? link.toType : link.fromType;
      const targetId = direction === 'outgoing' ? link.toId : link.fromId;
      const parsed = z.enum(entityTypes).safeParse(targetType);
      let label = targetType;
      let available = false;
      if (parsed.success) { try { label = (await requireEntity(db, parsed.data, targetId)).name; available = true; } catch { /* Deleted peers must not be exposed by links. */ } }
      return { ...link, direction, targetType, targetId, label, available };
    }));
  });
  app.post('/api/relations', async (req, reply) => {
    const data = relationInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const from = await requireEntity(tx, data.fromType, data.fromId); await requireEntity(tx, data.toType, data.toId);
      if (data.fromType === data.toType && data.fromId === data.toId) throw new AppError('INVALID_RELATION');
      const row = await tx.relation.create({ data: { ...data, startDate: data.startDate ? new Date(data.startDate) : undefined } });
      for (const [entityType, entityId] of [[data.fromType, data.fromId], [data.toType, data.toId]]) await logEvent(tx, { entityType, entityId, action: 'relation', name: from.name, batchId: row.id });
      return row;
    });
    return reply.code(201).send(row);
  });
  app.get('/api/records/:type/:id/timeline', async req => {
    const { type, id } = entityParams.parse(req.params); await requireEntity(db, type, id);
    const { page } = listQuery.parse(req.query);
    return db.timelineEvent.findMany({ where: { ...live, entityType: type, entityId: id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 });
  });
  app.post('/api/records/:type/:id/reveal', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { field } = z.object({ field: z.enum(['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes']) }).strict().parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireEntity(tx, type, id);
      await logEvent(tx, { entityType: type, entityId: id, action: 'reveal', name: row.name, diffs: { field }, isExample: row.isExample });
      const value = field in row ? (row as unknown as Record<string, unknown>)[field] : null;
      return { value: typeof value === 'string' ? decrypt(value, `${type}.${field}`) : null, expiresIn: 60 };
    });
  });
  app.delete('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    await softDelete(db, type, id, version); return { ok: true };
  });
  app.get('/api/trash', async () => db.trashEntry.findMany({ where: live, orderBy: { createdAt: 'desc' } }));
  app.post('/api/trash/:id/restore', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const item = await tx.trashEntry.findFirst({ where: { ...live, id } }); if (!item) throw new AppError('NOT_FOUND', 404);
      const where = { id: item.entityId }; const data = { deletedAt: null, version: { increment: 1 } };
      if (item.entityType === 'Club') await tx.club.update({ where, data });
      else if (item.entityType === 'Player') await tx.player.update({ where, data });
      else if (item.entityType === 'Person') await tx.person.update({ where, data });
      else if (item.entityType === 'Request') await tx.request.update({ where, data });
      else throw new AppError('INVALID_ENTITY');
      await tx.trashEntry.delete({ where: { id } });
      await logEvent(tx, { entityType: item.entityType, entityId: item.entityId, action: 'restore', name: item.label, isExample: item.isExample }); return { ok: true };
    });
  });
  app.delete('/api/trash/:id', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => {
      const item = await tx.trashEntry.findFirst({ where: { ...live, id } }); if (!item) throw new AppError('NOT_FOUND', 404);
      const where = { id: item.entityId };
      // Restrictive foreign keys protect unrelated records; deleting their links
      // requires an explicit dependency review in the later admin milestone.
      if (item.entityType === 'Club') await tx.club.delete({ where });
      else if (item.entityType === 'Player') await tx.player.delete({ where });
      else if (item.entityType === 'Person') await tx.person.delete({ where });
      else if (item.entityType === 'Request') await tx.request.delete({ where });
      else throw new AppError('INVALID_ENTITY');
      const ref = { OR: [{ fromType: item.entityType, fromId: item.entityId }, { toType: item.entityType, toId: item.entityId }] };
      await tx.relation.deleteMany({ where: { ownerId: 'owner', ...ref } });
      const related = { entityType: item.entityType, entityId: item.entityId, ownerId: 'owner' };
      await tx.note.deleteMany({ where: related }); await tx.attachment.deleteMany({ where: related });
      await tx.task.deleteMany({ where: related }); await tx.notification.deleteMany({ where: related });
      await tx.trashEntry.delete({ where: { id } });
      await logEvent(tx, { entityType: item.entityType, entityId: item.entityId, name: item.label, action: 'purge', isExample: item.isExample }); return { ok: true };
    });
  });
  app.get('/api/export/:type', async (req, reply) => {
    const { type } = z.object({ type: z.enum(entityTypes) }).parse(req.params);
    const rows = type === 'Club' ? await db.club.findMany({ where: live }) : type === 'Player' ? await db.player.findMany({ where: live }) : type === 'Person' ? await db.person.findMany({ where: live }) : await db.request.findMany({ where: live });
    const keys = Object.keys(rows[0] ?? { id: '', name: '' }).filter(key => !sensitiveKeys.has(key));
    const cell = (v: unknown) => '"' + String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const csv = [keys.join(','), ...rows.map(row => keys.map(k => cell((row as unknown as Record<string, unknown>)[k])).join(','))].join('\r\n');
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${type}.csv"`).send(csv);
  });
  app.get('/api/proposals', async req => {
    const { page } = listQuery.parse(req.query);
    return db.updateProposal.findMany({ where: { ...live, approvalStatus: 'PENDING' }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 });
  });
  app.post('/api/proposals/:id/review', async req => {
    const { id } = idParams.parse(req.params);
    const data = z.object({ action: z.enum(['approve', 'reject']), sourceUrl: z.string().url().optional(), reason: z.string().min(3).optional() }).strict().parse(req.body);
    return db.$transaction(async tx => {
      const proposal = await tx.updateProposal.findFirst({ where: { ...live, id, approvalStatus: 'PENDING' } }); if (!proposal) throw new AppError('NOT_FOUND', 404);
      if (data.action === 'approve') {
        if (!data.sourceUrl) throw new AppError('SOURCE_REQUIRED');
        // Canonical changes are blocked until their domain-specific validators
        // are implemented in B. Never report approval without applying a change.
        throw new AppError('PROPOSAL_TYPE_PENDING', 409);
      }
      if (!data.reason) throw new AppError('REASON_REQUIRED');
      const row = await tx.updateProposal.update({ where: { id }, data: { approvalStatus: 'REJECTED', rejectionReason: data.reason, reviewedAt: new Date() } });
      await logEvent(tx, { entityType: proposal.targetType, entityId: proposal.targetId, name: proposal.name, action: 'reject', isExample: proposal.isExample }); return row;
    });
  });
}
