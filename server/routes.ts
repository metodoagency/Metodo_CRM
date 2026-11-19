import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { clubInput, playerInput, personInput, suggestionInput, relationInput, entityTypes, maskSensitive, normalizeSearch } from '../shared/domain.js';
import { AppError, live, logEvent, requireEntity, softDelete } from './core.js';
import { createSuggestion } from './suggestions.js';
import { encrypt, decrypt, blindIndex, csrfToken } from './crypto.js';
import { sessionCookie } from './auth.js';
import { tr, en } from '../shared/locales.js';
import { fieldSource, provenanceFor } from '../shared/provenance.js';
import { cleanupExamples, deletionPreview, examplePreview, listTrash, purgeTrash, restoreTrash } from './lifecycle.js';
import { createClubUpdate, createStaffProposal, proposalContext, reviewProposal } from './proposals.js';
import { clubUpdateInput } from '../shared/club-updates.js';
import { clubListQuery, fieldVerification, reviewInput, settingsInput, staffProposalInput } from '../shared/contracts.js';
import { registerPrivacy } from './privacy.js';
import { registerRetention } from './retention.js';
import { validateRetentionPeriods } from './lifecycle.js';
import { clubWhere, registerClubNetwork } from './club-network.js';
import { registerClubSections } from './club-sections.js';
import { registerClubSources } from './club-sources.js';
import { registerStaffImport } from './staff-import.js';
import { exportPlayers, listPlayers, registerPlayerLists } from './player-list.js';
import { registerPlayerScoring } from './player-scoring.js';
import { registerPlayerMarket } from './player-market.js';
import { registerPlayerSuitability } from './player-suitability.js';
import { registerPlayerCards } from './player-card.js';
import { cleanBiography, registerPlayerBiographies } from './player-biography.js';
import { playerFilters } from '../shared/player-list.js';
import { registerPersonNetwork } from './person-network.js';
import { registerCalendar } from './calendar.js';
import { birthdayRule } from './birthdays.js';
import { csvCell } from './csv.js';
import { getTransferRequest, registerTransferRequests, updateTransferRequest } from './transfer-requests.js';
import { overduePresentations, registerPresentations } from './presentations.js';
import { registerSales } from './sales.js';
import { registerContracts } from './player-contracts.js';
import { contractReminderPrefix, currentContractNotificationKeys } from './contract-reminders.js';

const idParams = z.object({ id: z.string().uuid() });
const entityParams = z.object({ type: z.enum(entityTypes), id: z.string().uuid() });
const listQuery = z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(100).default(''), status: z.enum(['OWN', 'TARGET', 'INTERMEDIARY', 'MANDATED']).optional() }).strict();
const masked = (row: unknown) => maskSensitive(row);
const maskedRecord = (row: Awaited<ReturnType<typeof requireEntity>>) => masked('bio' in row ? { ...row, bio: cleanBiography(row.bio) } : row);
const trashWrite = z.object({ version: z.number().int().positive(), recordVersion: z.number().int().positive() }).strict();
const clubCsvFields = { id: true, name: true, shortName: true, countryId: true, regionId: true, city: true, lat: true, lng: true, stadium: true, foundedYear: true, relationStatus: true, isTracked: true, verificationStatus: true, isExample: true } as const;
const personCsvFields = { id: true, name: true, role: true, country: true, relationStatus: true, verificationStatus: true, isExample: true } as const;
const requestCsvFields = { id: true, name: true, clubId: true, requesterId: true, position: true, ageMin: true, ageMax: true, preferredFoot: true, euRequired: true, priority: true, deadline: true, status: true, isExample: true } as const;

export async function registerRoutes(app: FastifyInstance, db: PrismaClient) {
  await registerPrivacy(app, db);
  await registerRetention(app, db);
  await registerClubNetwork(app, db);
  await registerClubSections(app, db);
  await registerClubSources(app, db);
  await registerStaffImport(app, db);
  await registerPlayerLists(app, db);
  await registerPlayerScoring(app, db);
  await registerPlayerMarket(app, db);
  await registerPlayerSuitability(app, db);
  await registerPlayerCards(app, db);
  await registerPlayerBiographies(app, db);
  await registerPersonNetwork(app, db);
  await registerCalendar(app, db);
  await registerTransferRequests(app, db);
  await registerPresentations(app, db);
  await registerSales(app, db);
  await registerContracts(app, db);
  app.get('/api/me', async req => ({ id: 'owner', csrfToken: csrfToken(req.cookies[sessionCookie]!) }));
  app.get('/api/settings', async () => masked(await db.userSettings.upsert({ where: { ownerId: 'owner' }, create: { ownerId: 'owner' }, update: {} })));
  app.patch('/api/settings', async req => {
    const { version, ...data } = settingsInput.parse(req.body);
    if (data.retentionDays) validateRetentionPeriods(data.retentionDays);
    return db.$transaction(async tx => {
      const before = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } });
      if (!before || before.version !== version) throw new AppError('STALE_VERSION', 409);
      const after = await tx.userSettings.update({ where: { ownerId: 'owner', version }, data: { ...data, version: { increment: 1 } } });
      await logEvent(tx, { entityType: 'UserSettings', entityId: after.id, action: 'update', name: tr.settings, summaries: { tr: tr.timeline_update.replace('{name}', tr.settings), en: en.timeline_update.replace('{name}', en.settings) }, diffs: { old: before, new: data } });
      return masked(after);
    });
  });
  app.get('/api/overview', async () => {
    const [clubs, players, requests, proposals, pendingUpdates, tasks, meetings, recent, notifications, followUps] = await Promise.all([
      db.club.count({ where: live }), db.player.count({ where: live }), db.request.count({ where: { ...live, status: { not: 'CLOSED' } } }),
      db.updateProposal.count({ where: { ...live, approvalStatus: 'PENDING' } }),
      db.updateProposal.findMany({ where: { ...live, approvalStatus: 'PENDING' }, take: 5, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, type: true } }),
      db.task.findMany({ where: { ...live, status: 'OPEN' }, orderBy: { dueDate: 'asc' }, take: 5 }),
      db.meeting.findMany({ where: { ...live, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, orderBy: { date: 'asc' }, take: 4 }),
      db.timelineEvent.findMany({ where: live, orderBy: { createdAt: 'desc' }, take: 6 }),
      db.$transaction(async tx => tx.notification.count({ where: { ...live, status: 'NEW', AND: [
        { type: { not: birthdayRule } }, { OR: [{ NOT: { type: { startsWith: contractReminderPrefix } } }, { dedupeKey: { in: await currentContractNotificationKeys(tx) } }] },
      ] } }), { isolationLevel: 'RepeatableRead' }),
      db.presentation.findMany({
        where: overduePresentations(), take: 5, orderBy: [{ followUpDate: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, followUpDate: true, result: true },
      }),
    ]);
    return { clubs, players, requests, proposals, pendingUpdates, tasks, meetings, recent, notifications, followUps };
  });
  app.get('/api/clubs', async req => {
    const { page, q, ...filters } = clubListQuery.parse(req.query);
    const where = clubWhere(filters, q);
    const [items, total] = await db.$transaction([db.club.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50 }), db.club.count({ where })], { isolationLevel: 'RepeatableRead' });
    return { items, total, page };
  });
  app.post('/api/clubs', async (req, reply) => {
    const data = clubInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const row = await tx.club.create({ data: { ...data, fieldProvenance: provenanceFor(data), searchName: normalizeSearch(data.name) } });
      await logEvent(tx, { entityType: 'Club', entityId: row.id, action: 'create', name: row.name, diffs: { new: data } });
      return row;
    });
    return reply.code(201).send(row);
  });
  app.get('/api/players', async req => listPlayers(db, req.query));
  app.post('/api/players', async (req, reply) => {
    const input = playerInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      if (input.currentClubId) await requireEntity(tx, 'Club', input.currentClubId);
      const row = await tx.player.create({ data: { ...input, fieldProvenance: provenanceFor(input), birthDate: input.birthDate ? encrypt(input.birthDate, 'Player.birthDate') : undefined, birthDateIndex: input.birthDate ? blindIndex(input.birthDate) : undefined, searchName: normalizeSearch(input.name) } });
      await logEvent(tx, { entityType: 'Player', entityId: row.id, action: 'create', name: row.name, diffs: { new: input } });
      return row;
    });
    return reply.code(201).send(masked(row));
  });
  app.get('/api/people', async req => {
    const { page, q } = listQuery.parse(req.query);
    const where = { ...live, searchName: { contains: normalizeSearch(q) } };
    const [people, total] = await db.$transaction([
      db.person.findMany({ where, skip: (page - 1) * 50, take: 50, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
      db.person.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items: people.map(masked), total, page };
  });
  app.post('/api/people', async (req, reply) => {
    const data = personInput.parse(req.body);
    const row = await db.$transaction(async tx => {
      const row = await tx.person.create({ data: {
        ...data, fieldProvenance: provenanceFor(data), searchName: normalizeSearch(data.name),
        birthDate: data.birthDate ? encrypt(data.birthDate, 'Person.birthDate') : null,
        birthDateIndex: data.birthDate ? blindIndex(data.birthDate) : null,
      } });
      await logEvent(tx, { entityType: 'Person', entityId: row.id, name: row.name, action: 'create', diffs: { new: data } });
      return row;
    });
    return reply.code(201).send(masked(row));
  });
  app.post('/api/suggestions', async (req, reply) => reply.code(201).send(await createSuggestion(db, suggestionInput.parse(req.body))));
  app.get('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    if (type === 'Request') return getTransferRequest(db, id);
    return maskedRecord(await requireEntity(db, type, id));
  });
  app.patch('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { version, changes } = z.object({ version: z.number().int().positive(), changes: z.record(z.string(), z.unknown()) }).strict().parse(req.body);
    if (type === 'Request') return updateTransferRequest(db, id, version, changes);
    const schema = type === 'Club' ? clubInput.partial() : type === 'Player' ? playerInput.partial() : personInput.partial();
    const parsed = schema.parse(changes);
    // Optional partial fields must not re-apply create-time defaults.
    const input = Object.fromEntries(Object.entries(parsed).filter(([key]) => key in changes)) as typeof parsed;
    return db.$transaction(async tx => {
      const before = await requireEntity(tx, type, id);
      if (before.version !== version) throw new AppError('STALE_VERSION', 409);
      // Relationship changes use domain flows; this generic editor supports only
      // safe identity and status fields, with explicit schema validation.
      const nextPosition = 'primaryPosition' in input ? input.primaryPosition : undefined;
      const changedPosition = 'primaryPosition' in before && nextPosition && nextPosition !== before.primaryPosition;
      const secondaryPositions = changedPosition && 'secondaryPositions' in before && before.secondaryPositions.includes(nextPosition)
        ? before.secondaryPositions.filter(position => position !== nextPosition) : undefined;
      const changesToSave = changedPosition ? { ...input, levelScore: null, levelSubscores: {}, ...(secondaryPositions ? { secondaryPositions } : {}) } : input;
      const data: Record<string, unknown> = { ...changesToSave, fieldProvenance: provenanceFor(changesToSave, before.fieldProvenance), version: { increment: 1 } };
      if ('currentClubId' in input && input.currentClubId) await requireEntity(tx, 'Club', input.currentClubId);
      if ('birthDate' in input && input.birthDate !== undefined) {
        data.birthDate = input.birthDate ? encrypt(input.birthDate, `${type}.birthDate`) : null;
        data.birthDateIndex = input.birthDate ? blindIndex(input.birthDate) : null;
      }
      if ('name' in input && input.name) data.searchName = normalizeSearch(input.name);
      const where = { ...live, id, version };
      const after = type === 'Club' ? await tx.club.update({ where, data }) : type === 'Player' ? await tx.player.update({ where, data }) : await tx.person.update({ where, data });
      const old = Object.fromEntries(Object.keys(changesToSave).map(key => [key, before[key as keyof typeof before]]));
      await logEvent(tx, { entityType: type, entityId: id, name: before.name, action: 'update', diffs: { old, new: changesToSave }, isExample: before.isExample });
      return maskedRecord(after);
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
  app.post('/api/records/:type/:id/verify-field', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { field, version, sourceUrl } = fieldVerification.parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireEntity(tx, type, id);
      if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const sources = z.record(z.string(), fieldSource).parse(row.fieldProvenance);
      const source = Object.hasOwn(sources, field) && Object.hasOwn(row, field) ? sources[field] : undefined;
      if (!source?.sourceUrl) throw new AppError('SOURCE_REQUIRED');
      if (source.sourceUrl !== sourceUrl) throw new AppError('STALE_PREVIEW', 409);
      if (source.verificationStatus === 'VERIFIED') return { version, verificationStatus: 'VERIFIED' };
      const where = { ...live, id, version };
      const approved = { ...source, verificationStatus: 'VERIFIED' as const };
      const data = { fieldProvenance: { ...sources, [field]: approved }, version: { increment: 1 } };
      if (type === 'Club') await tx.club.update({ where, data });
      else if (type === 'Player') await tx.player.update({ where, data });
      else if (type === 'Person') await tx.person.update({ where, data });
      else await tx.request.update({ where, data });
      await logEvent(tx, { entityType: type, entityId: id, action: 'verify', name: row.name, isExample: row.isExample, diffs: {
        field, old: source.verificationStatus, new: approved.verificationStatus,
      } });
      return { version: version + 1, verificationStatus: approved.verificationStatus };
    });
  });
  app.post('/api/records/:type/:id/reveal', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { field } = z.object({ field: z.enum(['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes']) }).strict().parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireEntity(tx, type, id);
      await logEvent(tx, { entityType: type, entityId: id, action: 'reveal', name: row.name, diffs: { field }, isExample: row.isExample });
      const value = field in row ? (row as unknown as Record<string, unknown>)[field] : null;
      const decoded = typeof value === 'string' ? decrypt(value, `${type}.${field}`) : null;
      if (field === 'birthDate' && 'hideBirthYear' in row && row.hideBirthYear) {
        return { value: decoded?.slice(5) ?? null, format: 'monthDay', expiresIn: 60 };
      }
      return { value: decoded, expiresIn: 60 };
    });
  });
  app.delete('/api/records/:type/:id', async req => {
    const { type, id } = entityParams.parse(req.params);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    await softDelete(db, type, id, version); return { ok: true };
  });
  app.get('/api/records/:type/:id/delete-preview', async req => {
    const { type, id } = entityParams.parse(req.params); await requireEntity(db, type, id);
    return (await deletionPreview(db, type, id)).result;
  });
  app.get('/api/trash', async () => listTrash(db));
  app.get('/api/trash/:id/preview', async req => {
    const { id } = idParams.parse(req.params);
    const item = await db.trashEntry.findFirst({ where: { ...live, id } }); if (!item) throw new AppError('NOT_FOUND', 404);
    return (await deletionPreview(db, item.entityType, item.entityId)).result;
  });
  app.post('/api/trash/:id/restore', async req => {
    const { id } = idParams.parse(req.params);
    const { version, recordVersion } = trashWrite.parse(req.body);
    return restoreTrash(db, id, version, recordVersion);
  });
  app.delete('/api/trash/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version, recordVersion, previewToken } = trashWrite.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    return purgeTrash(db, id, version, recordVersion, previewToken);
  });
  app.get('/api/admin/examples/preview', async () => (await examplePreview(db)).result);
  app.post('/api/admin/examples/cleanup', async req => {
    const { previewToken } = z.object({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
    return cleanupExamples(db, previewToken);
  });
  app.get('/api/export/:type', async (req, reply) => {
    const { type } = z.object({ type: z.enum(entityTypes) }).parse(req.params);
    const csv = type === 'Player' ? await exportPlayers(db, playerFilters.parse({})) : await db.$transaction(async tx => {
      const query = { where: live, orderBy: { id: 'asc' as const } };
      const rows: Record<string, unknown>[] = type === 'Club' ? await tx.club.findMany({ ...query, select: clubCsvFields })
        : type === 'Person' ? await tx.person.findMany({ ...query, select: personCsvFields })
        : await tx.request.findMany({ ...query, select: requestCsvFields });
      const keys = Object.keys(type === 'Club' ? clubCsvFields : type === 'Person' ? personCsvFields : requestCsvFields);
      await logEvent(tx, { entityType: 'Owner', entityId: 'owner', action: 'export', name: type, diffs: { table: type, count: rows.length, sensitive: false } });
      return [keys.join(','), ...rows.map(row => keys.map(key => {
        const value = row[key];
        return csvCell(value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ''));
      }).join(','))].join('\r\n');
    }, { isolationLevel: 'RepeatableRead' });
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${type}.csv"`).send(csv);
  });
  app.get('/api/proposals', async req => {
    const { page } = listQuery.parse(req.query);
    return db.updateProposal.findMany({
      where: { ...live, approvalStatus: 'PENDING' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50,
      select: { id: true, version: true, name: true, summary: true, type: true },
    });
  });
  app.post('/api/clubs/:id/staff-proposals', async (req, reply) => {
    const proposal = await createStaffProposal(db, idParams.parse(req.params).id, staffProposalInput.parse(req.body));
    return reply.code(201).send(proposal);
  });
  app.post('/api/clubs/:id/update-proposals', async (req, reply) => {
    const proposal = await createClubUpdate(db, idParams.parse(req.params).id, clubUpdateInput.parse(req.body));
    return reply.code(201).send(proposal);
  });
  app.get('/api/proposals/:id/context', async req => proposalContext(db, idParams.parse(req.params).id));
  app.post('/api/proposals/:id/review', async req => {
    const { id } = idParams.parse(req.params);
    return reviewProposal(db, id, reviewInput.parse(req.body));
  });
}
