import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { reviewInput } from '../shared/contracts.js';
import { istanbulToday } from '../shared/domain.js';
import { tr, en } from '../shared/locales.js';
import { AppError, live, logEvent } from './core.js';

const tenureToken = (rows: { id: string; version: number }[]) => createHash('sha256').update(JSON.stringify(rows.map(row => [row.id, row.version]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))).digest('hex');
const openTenures = (clubId: string, personId?: string) => ({ ...live, fromType: 'Person', ...(personId ? { fromId: personId } : {}), toType: 'Club', toId: clubId, relation: 'memberOf' as const, endDate: null });

export async function proposalContext(db: PrismaClient, id: string) {
  return db.$transaction(async tx => {
    const proposal = await tx.updateProposal.findFirst({ where: { ...live, id, approvalStatus: 'PENDING' }, select: { id: true, version: true, name: true, summary: true, type: true, targetType: true, targetId: true, sourceUrl: true } });
    if (!proposal) throw new AppError('NOT_FOUND', 404);
    if (proposal.type !== 'coach_departure' || proposal.targetType !== 'Club') return { proposal, supported: false };
    const club = await tx.club.findFirst({ where: { ...live, id: proposal.targetId }, select: { id: true, name: true, version: true } });
    if (!club) throw new AppError('NOT_FOUND', 404);
    const tenures = await tx.relation.findMany({ where: openTenures(club.id), select: { id: true, version: true, fromId: true } });
    const people = await tx.person.findMany({ where: { ...live, id: { in: tenures.map(row => row.fromId) } }, select: { id: true, name: true, role: true, version: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return { proposal, supported: true, club, people: people.map(person => { const rows = tenures.filter(row => row.fromId === person.id); return { ...person, tenureCount: rows.length, tenureToken: tenureToken(rows) }; }) };
  }, { isolationLevel: 'RepeatableRead' });
}

export async function reviewProposal(db: PrismaClient, id: string, input: z.infer<typeof reviewInput>) {
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
    if (proposal.type !== 'coach_departure' || proposal.targetType !== 'Club') throw new AppError('PROPOSAL_TYPE_PENDING', 409);
    if (!input.personId) throw new AppError('PERSON_REQUIRED');
    if (!input.effectiveDate || !input.clubVersion || !input.personVersion || !input.tenureToken) throw new AppError('APPROVAL_CONTEXT_REQUIRED');
    const [club, person] = await Promise.all([
      tx.club.findFirst({ where: { ...live, id: proposal.targetId } }), tx.person.findFirst({ where: { ...live, id: input.personId } }),
    ]);
    if (!club || !person) throw new AppError('NOT_FOUND', 404);
    if (club.version !== input.clubVersion || person.version !== input.personVersion) throw new AppError('STALE_VERSION', 409);
    const tenures = await tx.relation.findMany({ where: openTenures(club.id, person.id) });
    if (!tenures.length) throw new AppError('PERSON_NOT_IN_CLUB');
    if (tenureToken(tenures) !== input.tenureToken) throw new AppError('PREVIEW_STALE', 409);
    const endDate = new Date(`${input.effectiveDate}T00:00:00Z`);
    if (tenures.some(row => row.startDate && row.startDate > endDate)) throw new AppError('INVALID_TENURE_DATE');
    const batchId = randomUUID(); const now = new Date(); const isExample = proposal.isExample || club.isExample || person.isExample;
    const evidence = { sourceUrl: input.sourceUrl, sourceType: proposal.sourceType, verificationStatus: 'VERIFIED' as const, retrievedAt: now };
    for (const tenure of tenures) {
      const changed = await tx.relation.updateMany({ where: { ...openTenures(club.id, person.id), id: tenure.id, version: tenure.version }, data: { endDate, ...evidence, fieldProvenance: { ...(tenure.fieldProvenance as object), endDate: { ...evidence, retrievedAt: now.toISOString() } }, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
    }
    if ((await tx.club.updateMany({ where: { ...live, id: club.id, version: input.clubVersion }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    if ((await tx.person.updateMany({ where: { ...live, id: person.id, version: input.personVersion }, data: { version: { increment: 1 } } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    const summaries = { tr: tr.coachDepartureSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', input.effectiveDate), en: en.coachDepartureSummary.replace('{person}', person.name).replace('{club}', club.name).replace('{date}', input.effectiveDate) };
    for (const [entityType, entityId, name] of [['Club', club.id, club.name], ['Person', person.id, person.name]]) await logEvent(tx, { entityType, entityId, name, action: 'coach_departure', batchId, isExample, summaries, diffs: { tenures: tenures.map(row => ({ id: row.id, oldEndDate: null, endDate: input.effectiveDate })), sourceUrl: input.sourceUrl } });
    const dueDate = new Date(`${istanbulToday(now)}T00:00:00Z`); dueDate.setUTCDate(dueDate.getUTCDate() + 2);
    const task = await tx.task.create({ data: { name: (isExample ? tr.exampleTaskPrefix : '') + tr.coachFollowUp.replace('{club}', club.name), priority: 'HIGH', dueDate, entityType: 'Club', entityId: club.id, isExample } });
    await logEvent(tx, { entityType: 'Task', entityId: task.id, name: task.name, action: 'create', isExample, batchId });
    const row = await tx.updateProposal.update({ where: { ...live, id, version: input.version, approvalStatus: 'PENDING' }, data: { approvalStatus: 'APPROVED', reviewedAt: now, ...evidence, payload: { personId: person.id, effectiveDate: input.effectiveDate, taskId: task.id }, version: { increment: 1 } } });
    await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, name: proposal.name, action: 'approve', isExample, batchId, diffs: { approvalStatus: 'APPROVED', sourceUrl: input.sourceUrl } });
    return row;
  }, { isolationLevel: 'Serializable' });
}
