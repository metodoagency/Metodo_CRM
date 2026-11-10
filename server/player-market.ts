import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { manualSourceUrl } from '../shared/club-sources.js';
import { marketEntry, marketPage, marketWrite, type MarketView } from '../shared/player-market.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';

const marketFields = { id: true, name: true, version: true, isExample: true, marketValue: true, marketValueCurrency: true,
  marketValueDate: true, marketValueSourceUrl: true, transfermarktUrl: true, fieldProvenance: true } as const;
const safeLink = (value: string | null) => manualSourceUrl.safeParse(value).data ?? null;
const isoDay = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

export async function registerPlayerMarket(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/players/:id/market', async req => {
    const { id } = idParams.parse(req.params);
    const { page } = marketPage.parse(req.query);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: marketFields });
      if (!row) throw new AppError('NOT_FOUND', 404);
      const events = await tx.timelineEvent.findMany({ where: { ...live, entityType: 'Player', entityId: id, action: 'market_value' },
        select: { id: true, diffs: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 51 });
      const items = events.slice(0, 50).flatMap(event => {
        const value = event.diffs && typeof event.diffs === 'object' && !Array.isArray(event.diffs) ? event.diffs.valuation : null;
        const parsed = marketEntry.safeParse(value);
        return parsed.success ? [{ ...parsed.data, id: event.id }] : [];
      });
      const view: MarketView = { version: row.version, profileUrl: safeLink(row.transfermarktUrl), more: events.length > 50, items,
        current: row.marketValue === null ? null : { amount: row.marketValue.toFixed(2), currency: row.marketValueCurrency, date: isoDay(row.marketValueDate), sourceUrl: safeLink(row.marketValueSourceUrl) } };
      return view;
    }, { isolationLevel: 'RepeatableRead' });
  });

  app.patch('/api/players/:id/market', async req => {
    const { id } = idParams.parse(req.params);
    const { version, profileUrl, ...input } = marketWrite.parse(req.body);
    return db.$transaction(async tx => {
      const row = await tx.player.findFirst({ where: { ...live, id }, select: marketFields });
      if (!row) throw new AppError('NOT_FOUND', 404);
      if (row.version !== version) throw new AppError('STALE_VERSION', 409);
      const amount = new Prisma.Decimal(input.amount).toFixed(2);
      const previousDate = isoDay(row.marketValueDate);
      const current = row.marketValue === null || previousDate === null || input.date >= previousDate;
      const changes = { ...(current ? { marketValue: amount, marketValueCurrency: input.currency, marketValueDate: input.date, marketValueSourceUrl: input.sourceUrl } : {}),
        ...(profileUrl !== undefined ? { transfermarktUrl: profileUrl } : {}) };
      const now = new Date();
      const evidence = { sourceUrl: input.sourceUrl, sourceType: 'MANUAL' as const, retrievedAt: now.toISOString(), verificationStatus: 'UNVERIFIED' as const };
      const fieldProvenance = Object.fromEntries(Object.keys(changes).filter(key => key !== 'transfermarktUrl').map(key => [key, evidence]));
      const previous = {
        ...(current ? { marketValue: row.marketValue?.toFixed(2) ?? null, marketValueCurrency: row.marketValueCurrency,
          marketValueDate: previousDate, marketValueSourceUrl: row.marketValueSourceUrl } : {}),
        ...(profileUrl !== undefined ? { transfermarktUrl: row.transfermarktUrl } : {}),
      };
      const updated = await tx.player.update({ where: { ...live, id, version }, data: { ...changes,
        ...(current ? { marketValueDate: new Date(`${input.date}T00:00:00Z`) } : {}),
        fieldProvenance: provenanceFor({ ...changes, fieldProvenance }, row.fieldProvenance, now), version: { increment: 1 },
      }, select: { version: true } });
      await logEvent(tx, { entityType: 'Player', entityId: id, action: 'market_value', name: row.name, isExample: row.isExample,
        diffs: { old: previous, new: changes, valuation: { ...input, amount }, current } });
      return { version: updated.version };
    }, { isolationLevel: 'Serializable' });
  });
}
