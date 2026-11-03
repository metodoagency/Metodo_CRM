import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { istanbulToday, suggestionInput } from '../shared/domain.js';
import { AppError, live, logEvent, requireEntity } from './core.js';
import { tr, en } from '../shared/locales.js';

export async function createSuggestion(db: PrismaClient, input: z.infer<typeof suggestionInput>, isExample = false) {
  return db.$transaction(async tx => {
    const request = await tx.request.findFirst({ where: { ...live, id: input.requestId } });
    if (!request || request.status === 'CLOSED') throw new AppError('NOT_FOUND', 404);
    const club = await requireEntity(tx, 'Club', request.clubId);
    const person = await requireEntity(tx, 'Person', input.personId);
    const player = await requireEntity(tx, 'Player', input.playerId);
    if (!await tx.relation.findFirst({ where: { ...live, fromType: 'Person', fromId: person.id, toType: 'Club', toId: club.id, relation: { in: ['memberOf', 'contactOf'] }, endDate: null } })) throw new AppError('PERSON_NOT_AT_CLUB');
    const batchId = randomUUID();
    const date = new Date(`${istanbulToday()}T00:00:00Z`);
    const followUpDate = input.followUpDate ? new Date(`${input.followUpDate}T00:00:00Z`) : new Date(date.getTime() + 5 * 86400_000);
    const name = `${isExample ? 'Örnek ' : ''}${player.name} → ${club.name}`;
    const suggestion = await tx.suggestion.create({ data: { name, requestId: request.id, playerId: player.id, personId: person.id, clubId: club.id, date, matchScore: input.matchScore, fitReasons: [], missingCriteria: input.matchScore === null ? ['matchScore'] : [], whyGoodTransfer: input.whyGoodTransfer, batchId, isExample } });
    await tx.relation.create({ data: { fromType: 'Player', fromId: player.id, toType: 'Club', toId: club.id, relation: 'suggestedTo', startDate: date, note: `${person.name} · ${request.name} · ${istanbulToday()}`, isExample } });
    await tx.presentation.create({ data: { name, date, clubId: club.id, playerId: player.id, personId: person.id, requestId: request.id, followUpDate, note: input.whyGoodTransfer, isExample } });
    await tx.request.update({ where: { id: request.id, version: request.version }, data: { status: 'SUGGESTED', version: { increment: 1 } } });
    const values: Record<string, string> = { club: club.name, person: person.name, request: request.name, date: istanbulToday() };
    const summaries = { tr: tr.suggestionSummary.replace(/\{(\w+)\}/g, (_, key: string) => values[key]), en: en.suggestionSummary.replace(/\{(\w+)\}/g, (_, key: string) => values[key]) };
    for (const [entityType, entity] of [['Player', player], ['Club', club], ['Person', person], ['Request', request]] as const) {
      await logEvent(tx, { entityType, entityId: entity.id, name: entity.name, action: 'suggestion', diffs: { old: { status: request.status }, new: { status: 'SUGGESTED', suggestionId: suggestion.id } }, batchId, isExample, summaries });
    }
    return suggestion;
  }, { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel });
}
