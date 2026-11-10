import { createHash, randomUUID } from 'node:crypto';
import type { Club, Person, PrismaClient, Relation, UpdateProposal } from '@prisma/client';
import { z } from 'zod';
import { reviewInput, staffProposalInput } from '../shared/contracts.js';
import { clubUpdateInput, clubUpdateReview, clubUpdateTypes } from '../shared/club-updates.js';
import { importedStaff, tffEvidenceUrl } from '../shared/staff-import.js';
import { istanbulToday } from '../shared/domain.js';
import { tr, en } from '../shared/locales.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';

const tenureToken = (rows: { id: string; version: number }[]) => createHash('sha256').update(JSON.stringify(rows.map(row => [row.id, row.version]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex');
const openTenures = (clubId: string, personId?: string) => ({ ...live, fromType: 'Person', ...(personId ? { fromId: personId } : {}), toType: 'Club', toId: clubId, relation: 'memberOf' as const, endDate: null });
const staffChange = (type: string) => type === 'coach_departure' || type === 'coach_appointment';
const newsChange = (type: string): type is typeof clubUpdateTypes[number] => (clubUpdateTypes as readonly string[]).includes(type);
const stadiumPayload = z.object({ stadium: clubUpdateReview.shape.stadium });
type Evidence = { sourceUrl: string; sourceType: Relation['sourceType']; verificationStatus: 'VERIFIED'; retrievedAt: Date };
type Review = z.infer<typeof reviewInput>;

export async function createStaffProposal(db: PrismaClient, clubId: string, input: z.infer<typeof staffProposalInput>) {
  return db.$transaction(async tx => {
    const club = await requireEntity(tx, 'Club', clubId);
    const proposal = await tx.updateProposal.create({ data: {
      ...input, targetType: 'Club', targetId: clubId, payload: {}, isExample: club.isExample,
    } });
    await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, action: 'create', name: proposal.name, isExample: club.isExample });
    return proposal;
  }, { isolationLevel: 'Serializable' });
}

export async function createClubUpdate(db: PrismaClient, clubId: string, input: z.infer<typeof clubUpdateInput>) {
  return db.$transaction(async tx => {
    const club = await requireEntity(tx, 'Club', clubId);
    const name = input.type === 'injury' ? (club.isExample ? tr.exampleTaskPrefix : '') + tr.clubUpdate_injury : input.name;
    const summary = input.type === 'injury' ? '' : input.summary;
    const proposal = await tx.updateProposal.create({ data: {
      name, summary, type: input.type, sourceUrl: input.sourceUrl, date: new Date(`${input.date}T00:00:00Z`),
      targetType: 'Club', targetId: clubId, payload: input.type === 'stadium' ? { stadium: input.stadium } : {}, isExample: club.isExample,
    } });
    await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, action: 'create', name, isExample: club.isExample });
    return proposal;
  }, { isolationLevel: 'Serializable' });
}

async function closeTenures(tx: Tx, tenures: Relation[], endDate: Date, evidence: Evidence) {
  if (tenures.some(row => row.startDate && row.startDate > endDate)) throw new AppError('INVALID_TENURE_DATE');
  for (const tenure of tenures) {
    const changed = await tx.relation.updateMany({
      where: { ...live, id: tenure.id, endDate: null, version: tenure.version },
      data: { endDate, ...evidence, fieldProvenance: { ...(tenure.fieldProvenance as object), endDate: { ...evidence, retrievedAt: evidence.retrievedAt.toISOString() } }, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
  }
}

export async function proposalContext(db: PrismaClient, id: string) {
  return db.$transaction(async tx => {
    const row = await tx.updateProposal.findFirst({ where: { ...live, id, approvalStatus: 'PENDING' }, select: { id: true, version: true, name: true, summary: true, type: true, targetType: true, targetId: true, sourceUrl: true, date: true, payload: true } });
    if (!row) throw new AppError('NOT_FOUND', 404);
    const { payload, ...proposal } = row;
    if (proposal.targetType !== 'Club' || !staffChange(proposal.type) && !newsChange(proposal.type)) return { proposal, supported: false };
    const club = await tx.club.findFirst({ where: { ...live, id: proposal.targetId }, select: { id: true, name: true, version: true, stadium: true } });
    if (!club) throw new AppError('NOT_FOUND', 404);
    if (newsChange(proposal.type)) {
      const parsed = stadiumPayload.safeParse(payload);
      const update = { date: proposal.date.toISOString().slice(0, 10), stadium: proposal.type === 'stadium' && parsed.success ? parsed.data.stadium : undefined };
      return { proposal, supported: true, kind: 'news' as const, club, update };
    }
    const tenures = await tx.relation.findMany({ where: openTenures(club.id), select: { id: true, version: true, fromId: true, role: true, startDate: true } });
    const people = await tx.person.findMany({ where: { ...live, id: { in: tenures.map(row => row.fromId) } }, select: { id: true, name: true, role: true, version: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    const imported = importedStaff.safeParse(payload);
    return { proposal, supported: true, kind: 'staff' as const, club, candidate: imported.success ? imported.data.candidate : undefined, people: people.map(person => {
      const rows = tenures.filter(row => row.fromId === person.id);
      const headCoachRows = rows.filter(row => (row.role ?? person.role) === 'HEAD_COACH');
      return { ...person, tenureCount: rows.length, tenureToken: tenureToken(rows), tenures: rows.map(row => ({ ...row, role: row.role ?? person.role })), headCoachToken: headCoachRows.length ? tenureToken(headCoachRows) : null };
    }) };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function reviewProposal(db: PrismaClient, id: string, input: Review) {
  return db.$transaction(async tx => {
    const proposal = await tx.updateProposal.findFirst({ where: { ...live, id, approvalStatus: 'PENDING' } });
    if (!proposal) throw new AppError('NOT_FOUND', 404);
    if (proposal.version !== input.version) throw new AppError('STALE_VERSION', 409);
    if (input.action === 'reject') {
      if (!input.reason) throw new AppError('REASON_REQUIRED');
      const row = await tx.updateProposal.update({ where: { ...live, id, version: input.version, approvalStatus: 'PENDING' }, data: { approvalStatus: 'REJECTED', rejectionReason: input.reason, reviewedAt: new Date(), version: { increment: 1 } } });
      await logEvent(tx, { entityType: proposal.targetType, entityId: proposal.targetId, name: proposal.name, action: 'reject', isExample: proposal.isExample });
      return row;
    }
    if (!input.sourceUrl) throw new AppError('SOURCE_REQUIRED');
    if (proposal.targetType === 'Club' && newsChange(proposal.type)) return approveClubUpdate(tx, proposal, { ...input, sourceUrl: input.sourceUrl });
    if (!staffChange(proposal.type) || proposal.targetType !== 'Club') throw new AppError('PROPOSAL_TYPE_PENDING', 409);
    const imported = importedStaff.safeParse(proposal.payload);
    if (proposal.sourceType === 'TFF') tffEvidenceUrl.parse(input.sourceUrl);
    if (!input.personId) throw new AppError('PERSON_REQUIRED');
    if (!input.effectiveDate || !input.clubVersion || !input.personVersion) throw new AppError('APPROVAL_CONTEXT_REQUIRED');
    const [club, person] = await Promise.all([
      tx.club.findFirst({ where: { ...live, id: proposal.targetId } }), tx.person.findFirst({ where: { ...live, id: input.personId } }),
    ]);
    if (!club || !person) throw new AppError('NOT_FOUND', 404);
    if (club.version !== input.clubVersion || person.version !== input.personVersion) throw new AppError('STALE_VERSION', 409);
    if (proposal.type === 'coach_appointment') return approveAppointment(tx, proposal, club, person, { ...input, sourceUrl: input.sourceUrl, effectiveDate: input.effectiveDate }, imported.success ? imported.data : {});
    if (!input.tenureToken) throw new AppError('APPROVAL_CONTEXT_REQUIRED');
    const tenures = await tx.relation.findMany({ where: openTenures(club.id, person.id) });
    if (!tenures.length) throw new AppError('PERSON_NOT_IN_CLUB');
    if (tenureToken(tenures) !== input.tenureToken) throw new AppError('PREVIEW_STALE', 409);
    const endDate = new Date(`${input.effectiveDate}T00:00:00Z`);
    const batchId = randomUUID(); const now = new Date(); const isExample = proposal.isExample || club.isExample || person.isExample;
    const evidence = { sourceUrl: input.sourceUrl, sourceType: proposal.sourceType, verificationStatus: 'VERIFIED' as const, retrievedAt: now };
    await closeTenures(tx, tenures, endDate, evidence);
    if ((await tx.club.updateMany({ where: { ...live, id: club.id, version: input.clubVersion }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    if ((await tx.person.updateMany({ where: { ...live, id: person.id, version: input.personVersion }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    const summaries = { tr: tr.coachDepartureSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', input.effectiveDate), en: en.coachDepartureSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', input.effectiveDate) };
    for (const [entityType, entityId, name] of [['Club', club.id, club.name], ['Person', person.id, person.name]]) await logEvent(tx, { entityType, entityId, name, action: 'coach_departure', batchId, isExample, summaries, diffs: { tenures: tenures.map(row => ({ id: row.id, oldEndDate: null, endDate: input.effectiveDate })), sourceUrl: input.sourceUrl } });
    const dueDate = new Date(`${istanbulToday(now)}T00:00:00Z`); dueDate.setUTCDate(dueDate.getUTCDate() + 2);
    const task = await tx.task.create({ data: { name: (isExample ? tr.exampleTaskPrefix : '') + tr.coachFollowUp.replace('{club}', club.name), priority: 'HIGH', dueDate, entityType: 'Club', entityId: club.id, isExample } });
    await logEvent(tx, { entityType: 'Task', entityId: task.id, name: task.name, action: 'create', isExample, batchId });
    const row = await tx.updateProposal.update({ where: { ...live, id, version: input.version, approvalStatus: 'PENDING' }, data: { approvalStatus: 'APPROVED', reviewedAt: now, ...evidence, payload: { ...(imported.success ? imported.data : {}), personId: person.id, effectiveDate: input.effectiveDate, taskId: task.id }, version: { increment: 1 } } });
    await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, name: proposal.name, action: 'approve', isExample, batchId, diffs: { approvalStatus: 'APPROVED', sourceUrl: input.sourceUrl } });
    return row;
  }, { isolationLevel: 'Serializable' });
}

async function approveClubUpdate(tx: Tx, proposal: UpdateProposal, input: Review & { sourceUrl: string }) {
  if (!input.clubVersion || !input.update) throw new AppError('APPROVAL_CONTEXT_REQUIRED');
  const club = await tx.club.findFirst({ where: { ...live, id: proposal.targetId } });
  if (!club) throw new AppError('NOT_FOUND', 404);
  if (club.version !== input.clubVersion) throw new AppError('STALE_VERSION', 409);
  const update = clubUpdateInput.parse({ ...input.update, type: proposal.type, sourceUrl: input.sourceUrl });
  const now = new Date();
  const evidence = { sourceUrl: input.sourceUrl, sourceType: proposal.sourceType, verificationStatus: 'VERIFIED' as const, retrievedAt: now };
  const batchId = randomUUID();
  if (update.type === 'stadium') {
    await tx.club.update({ where: { ...live, id: club.id, version: club.version }, data: {
      stadium: update.stadium, version: { increment: 1 },
      fieldProvenance: { ...(club.fieldProvenance as object), stadium: { ...evidence, retrievedAt: now.toISOString() } },
    } });
  }
  const name = update.type === 'injury' ? proposal.name : update.name;
  const row = await tx.updateProposal.update({
    where: { ...live, id: proposal.id, version: input.version, approvalStatus: 'PENDING' }, data: {
      name, summary: update.type === 'injury' ? '' : update.summary, date: new Date(`${update.date}T00:00:00Z`),
      ...evidence, reviewedAt: now, approvalStatus: 'APPROVED', version: { increment: 1 }, payload: update.type === 'stadium' ? { stadium: update.stadium } : {},
    },
  });
  await logEvent(tx, { entityType: 'Club', entityId: club.id, action: 'club_news', name, batchId, isExample: proposal.isExample,
    summaries: { tr: tr.timeline_club_news.replace('{name}', update.type === 'injury' ? tr.clubUpdate_injury : name), en: en.timeline_club_news.replace('{name}', update.type === 'injury' ? en.clubUpdate_injury : name) },
    diffs: { proposalId: proposal.id, type: proposal.type, date: update.date, sourceUrl: input.sourceUrl,
      ...(update.type === 'stadium' ? { old: { stadium: club.stadium }, new: { stadium: update.stadium } } : {}) } });
  await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, action: 'approve', name, batchId, isExample: proposal.isExample, diffs: { approvalStatus: 'APPROVED', sourceUrl: input.sourceUrl } });
  return row;
}

async function approveAppointment(tx: Tx, proposal: UpdateProposal, club: Club, person: Person, input: Review & { sourceUrl: string; effectiveDate: string }, imported: Partial<z.infer<typeof importedStaff>>) {
  const { staffRole, predecessor, sourceUrl, effectiveDate } = input;
  if (!staffRole) throw new AppError('STAFF_ROLE_REQUIRED');
  if (predecessor && (staffRole !== 'HEAD_COACH' || predecessor.personId === person.id)) throw new AppError('INVALID_PREDECESSOR');
  const startDate = new Date(`${effectiveDate}T00:00:00Z`);
  const duplicate = await tx.relation.findFirst({ where: {
    ...openTenures(club.id, person.id),
    OR: [{ role: staffRole }, ...(person.role === staffRole ? [{ role: null }] : [])],
  } });
  if (duplicate) throw new AppError('TENURE_EXISTS', 409);

  const now = new Date();
  const evidence = { sourceUrl, sourceType: proposal.sourceType, verificationStatus: 'VERIFIED' as const, retrievedAt: now };
  const fieldEvidence = { ...evidence, retrievedAt: now.toISOString() };
  const batchId = randomUUID();
  let closed: Relation[] = [];
  let previous: Person | null = null;
  if (predecessor) {
    previous = await tx.person.findFirst({ where: { ...live, id: predecessor.personId } });
    if (!previous || previous.version !== predecessor.version) throw new AppError('STALE_VERSION', 409);
    closed = await tx.relation.findMany({ where: {
      ...openTenures(club.id, previous.id),
      OR: [{ role: 'HEAD_COACH' }, ...(previous.role === 'HEAD_COACH' ? [{ role: null }] : [])],
    } });
    if (!closed.length || tenureToken(closed) !== predecessor.tenureToken) throw new AppError('PREVIEW_STALE', 409);
    await closeTenures(tx, closed, startDate, evidence);
  }

  const isExample = proposal.isExample || club.isExample || person.isExample || Boolean(previous?.isExample);
  const tenure = await tx.relation.create({ data: {
    fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: 'memberOf', role: staffRole,
    startDate, isExample, ...evidence, fieldProvenance: { role: fieldEvidence, startDate: fieldEvidence, fromId: fieldEvidence, toId: fieldEvidence },
  } });
  await tx.club.update({ where: { ...live, id: club.id, version: club.version }, data: { version: { increment: 1 } } });
  await tx.person.update({ where: { ...live, id: person.id, version: person.version }, data: { version: { increment: 1 } } });
  const summaries = {
    tr: tr.coachAppointmentSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', effectiveDate),
    en: en.coachAppointmentSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', effectiveDate),
  };
  const ended = closed.map(row => ({ id: row.id, oldEndDate: null, endDate: effectiveDate }));
  const created = { id: tenure.id, personId: person.id, role: staffRole, startDate: effectiveDate };
  await logEvent(tx, { entityType: 'Club', entityId: club.id, name: club.name, action: 'coach_appointment', batchId, isExample, summaries, diffs: { created, ended, sourceUrl } });
  await logEvent(tx, { entityType: 'Person', entityId: person.id, name: person.name, action: 'coach_appointment', batchId, isExample, summaries, diffs: { created, sourceUrl } });
  if (previous) {
    await tx.person.update({ where: { ...live, id: previous.id, version: previous.version }, data: { version: { increment: 1 } } });
    const departure = {
      tr: tr.coachDepartureSummary.replace('{person}', previous.name).replace('{club}', club.name).replace('{date}', effectiveDate),
      en: en.coachDepartureSummary.replace('{person}', previous.name).replace('{club}', club.name).replace('{date}', effectiveDate),
    };
    await logEvent(tx, { entityType: 'Person', entityId: previous.id, name: previous.name, action: 'coach_departure', batchId, isExample, summaries: departure, diffs: { tenures: ended, sourceUrl } });
  }

  const row = await tx.updateProposal.update({
    where: { ...live, id: proposal.id, version: input.version, approvalStatus: 'PENDING' },
    data: { approvalStatus: 'APPROVED', reviewedAt: now, ...evidence, payload: { ...imported, personId: person.id, effectiveDate, staffRole, tenureId: tenure.id, predecessorId: previous?.id ?? null }, version: { increment: 1 } },
  });
  await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, name: proposal.name, action: 'approve', isExample, batchId, diffs: { approvalStatus: 'APPROVED', sourceUrl } });
  return row;
}
