import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { agentBirthdayCreate, agentBirthdayQuery, birthdayChange, birthdayPage, birthdaySubject, calendarPage, greetingSubject, greetingWrite, significantDateChange, significantDateWrite, type Greeting } from '../shared/calendar.js';
import { idParams, versionInput } from '../shared/contracts.js';
import { istanbulToday, normalizeSearch } from '../shared/domain.js';
import { provenanceFor } from '../shared/provenance.js';
import { retentionPeriods } from '../shared/retention.js';
import { birthdayRecord, birthdayTransaction, calendarPageSize, readBirthdayCalendar, sensitiveViewSeconds } from './birthdays.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { blindIndex, decrypt, encrypt } from './crypto.js';

type GreetingSubject = z.infer<typeof greetingSubject>;
const greetingWhere = ({ kind, id, year }: GreetingSubject) => ({ ownerId: live.ownerId, entityType: kind, entityId: id, year });

async function greetingParent(tx: Tx, { kind, id, year }: GreetingSubject) {
  if (year > Number(istanbulToday().slice(0, 4)) + 1) throw new AppError('INVALID_INPUT');
  const row = await birthdayRecord(tx, kind, id);
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}

async function calendarTrash(tx: Tx, type: 'SignificantDate' | 'BirthdayGreeting', row: { id: string; isExample: boolean }, label: string) {
  const settings = await tx.userSettings.findUnique({ where: { ownerId: live.ownerId }, select: { retentionDays: true } });
  const days = retentionPeriods.parse(settings?.retentionDays ?? {})[type] ?? 30;
  await tx.trashEntry.create({ data: { entityType: type, entityId: row.id, label, expiresAt: new Date(Date.now() + days * 86400_000), isExample: row.isExample } });
  await logEvent(tx, { entityType: type, entityId: row.id, action: 'delete', name: label, isExample: row.isExample });
}

export async function registerCalendar(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/calendar/birthdays', async req => {
    const { view, page } = birthdayPage.parse(req.body);
    return birthdayTransaction(db, tx => readBirthdayCalendar(tx, view, page));
  });
  app.patch('/api/calendar/birthdays/:kind/:id', async req => {
    const { kind, id } = birthdaySubject.parse(req.params);
    const { version, ...fields } = birthdayChange.parse(req.body);
    return db.$transaction(async tx => {
      const row = await birthdayRecord(tx, kind, id);
      if (!row) throw new AppError('NOT_FOUND', 404);
      const where = { ...live, id, version };
      const data = {
        hideBirthYear: fields.hideBirthYear,
        ...(fields.birthDate === undefined ? {} : { birthDate: fields.birthDate ? encrypt(fields.birthDate, `${kind}.birthDate`) : null }),
        version: { increment: 1 },
      };
      const birthDateIndex = fields.birthDate === undefined ? undefined : fields.birthDate ? blindIndex(fields.birthDate) : null;
      const fieldProvenance = provenanceFor(fields, row.fieldProvenance);
      const indexedData = { ...data, fieldProvenance, birthDateIndex };
      const saved = kind === 'Agent' ? await tx.agent.updateMany({ where, data: { ...data, fieldProvenance } })
        : kind === 'Person' ? await tx.person.updateMany({ where, data: indexedData }) : await tx.player.updateMany({ where, data: indexedData });
      if (saved.count !== 1) throw new AppError('STALE_VERSION', 409);
      await logEvent(tx, {
        entityType: kind, entityId: id, name: row.name, action: 'update', isExample: row.isExample,
        diffs: { old: { hideBirthYear: row.hideBirthYear, ...(fields.birthDate === undefined ? {} : { birthDate: row.birthDate }) }, new: fields },
      });
      return { version: version + 1 };
    });
  });
  app.post('/api/calendar/birthdays/:kind/:id/view', async req => {
    const { kind, id } = birthdaySubject.parse(req.params);
    return birthdayTransaction(db, async tx => {
      const row = await birthdayRecord(tx, kind, id);
      if (!row) throw new AppError('NOT_FOUND', 404);
      const date = row.birthDate ? decrypt(row.birthDate, `${kind}.birthDate`) : null;
      if (date) await tx.auditLog.create({ data: { entityType: kind, entityId: id, isExample: row.isExample, actor: 'owner', action: 'reveal', diffs: { field: 'birthDate' } } });
      return { value: row.hideBirthYear ? date?.slice(5) ?? null : date, expiresIn: sensitiveViewSeconds };
    });
  });
  app.get('/api/calendar/agents', async req => {
    const { page, q } = agentBirthdayQuery.parse(req.query);
    const offset = (page - 1) * calendarPageSize;
    const query = { where: live, select: { id: true, name: true, hideBirthYear: true, version: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] } as const;
    const search = normalizeSearch(q);
    if (search) {
      const matches = (await db.agent.findMany({ ...query, orderBy: [...query.orderBy] })).filter(row => normalizeSearch(row.name).includes(search));
      return { items: matches.slice(offset, offset + calendarPageSize), total: matches.length };
    }
    const [items, total] = await db.$transaction([
      db.agent.findMany({ ...query, orderBy: [...query.orderBy], skip: offset, take: calendarPageSize }),
      db.agent.count({ where: live }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items, total };
  });
  app.post('/api/calendar/agents', async (req, reply) => {
    const input = agentBirthdayCreate.parse(req.body);
    const result = await db.$transaction(async tx => {
      const agent = await tx.agent.create({
        data: { ...input, birthDate: encrypt(input.birthDate, 'Agent.birthDate'), fieldProvenance: provenanceFor(input), countries: [], markets: [], networkMemberships: [] },
        select: { id: true, name: true, version: true },
      });
      await logEvent(tx, { entityType: 'Agent', entityId: agent.id, name: agent.name, action: 'create', diffs: { new: input } });
      return agent;
    });
    return reply.code(201).send(result);
  });
  app.post('/api/calendar/greetings/:kind/:id/:year/view', async (req): Promise<Greeting> => {
    const subject = greetingSubject.parse(req.params);
    return birthdayTransaction(db, async tx => {
      await greetingParent(tx, subject);
      const row = await tx.birthdayGreeting.findUnique({ where: { ownerId_entityType_entityId_year: greetingWhere(subject) } });
      if (row?.deletedAt) throw new AppError('LINKED_RECORDS', 409);
      if (row?.greetingNote) await tx.auditLog.create({ data: { entityType: 'BirthdayGreeting', entityId: row.id, action: 'reveal', actor: 'owner', isExample: row.isExample, diffs: { field: 'greetingNote' } } });
      return { version: row?.version ?? null, greetingNote: row?.greetingNote ? decrypt(row.greetingNote, 'BirthdayGreeting.greetingNote') : '', sent: !!row?.sentAt, expiresIn: sensitiveViewSeconds };
    });
  });
  app.patch('/api/calendar/greetings/:kind/:id/:year', async req => {
    const subject = greetingSubject.parse(req.params);
    const { version, greetingNote, sent } = greetingWrite.parse(req.body);
    return db.$transaction(async tx => {
      const parent = await greetingParent(tx, subject);
      const key = greetingWhere(subject);
      const old = await tx.birthdayGreeting.findUnique({ where: { ownerId_entityType_entityId_year: key } });
      if (old?.deletedAt || (old?.version ?? null) !== version) throw new AppError('STALE_VERSION', 409);
      const fields = { greetingNote: greetingNote ? encrypt(greetingNote, 'BirthdayGreeting.greetingNote') : null, sentAt: sent ? old?.sentAt ?? new Date() : null };
      const row = old ? await tx.birthdayGreeting.update({ where: { ...live, id: old.id, version: old.version }, data: { ...fields, version: { increment: 1 } } })
        : await tx.birthdayGreeting.create({ data: { ...key, ...fields, isExample: parent.isExample } });
      await logEvent(tx, { entityType: 'BirthdayGreeting', entityId: row.id, name: parent.name, action: old ? 'update' : 'create', isExample: row.isExample, diffs: {
        old: { greetingNote: old?.greetingNote, sent: !!old?.sentAt }, new: { greetingNote, sent },
      } });
      return { version: row.version, sent: !!row.sentAt };
    }, { isolationLevel: 'Serializable' });
  });
  app.delete('/api/calendar/greetings/:kind/:id/:year', async req => {
    const subject = greetingSubject.parse(req.params);
    const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const parent = await greetingParent(tx, subject);
      const row = await tx.birthdayGreeting.update({
        where: { ...live, ownerId_entityType_entityId_year: greetingWhere(subject), version },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      await calendarTrash(tx, 'BirthdayGreeting', row, parent.name);
      return { ok: true };
    });
  });
  app.get('/api/calendar/dates', async req => {
    const { page } = calendarPage.parse(req.query);
    const [items, total] = await db.$transaction([
      db.significantDate.findMany({ where: live, select: { id: true, name: true, date: true, version: true }, orderBy: [{ date: 'asc' }, { id: 'asc' }], skip: (page - 1) * calendarPageSize, take: calendarPageSize }),
      db.significantDate.count({ where: live }),
    ], { isolationLevel: 'RepeatableRead' });
    return { items, total };
  });
  app.post('/api/calendar/dates', async (req, reply) => {
    const input = significantDateWrite.parse(req.body);
    const row = await db.$transaction(async tx => {
      const date = await tx.significantDate.create({ data: { ...input, date: new Date(input.date), fieldProvenance: provenanceFor(input) } });
      await logEvent(tx, { entityType: 'SignificantDate', entityId: date.id, name: date.name, action: 'create', diffs: { new: input } });
      return date;
    });
    return reply.code(201).send(row);
  });
  app.patch('/api/calendar/dates/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version, ...input } = significantDateChange.parse(req.body);
    return db.$transaction(async tx => {
      const old = await tx.significantDate.findUnique({ where: { ...live, id } });
      if (!old) throw new AppError('NOT_FOUND', 404);
      const row = await tx.significantDate.update({ where: { ...live, id, version }, data: { ...input, date: new Date(input.date), fieldProvenance: provenanceFor(input, old.fieldProvenance), version: { increment: 1 } } });
      await logEvent(tx, { entityType: 'SignificantDate', entityId: id, name: row.name, action: 'update', diffs: { old: { name: old.name, date: old.date.toISOString().slice(0, 10) }, new: input }, isExample: row.isExample });
      return row;
    });
  });
  app.delete('/api/calendar/dates/:id', async req => {
    const { id } = idParams.parse(req.params);
    const { version } = versionInput.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.significantDate.update({ where: { ...live, id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await calendarTrash(tx, 'SignificantDate', row, row.name);
      return { ok: true };
    });
  });
}
