import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { documentInput, type DocumentContent } from '../shared/documents.js';
import { istanbulToday } from '../shared/domain.js';
import { en, tr } from '../shared/locales.js';
import type { Config } from './config.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { renderDocument } from './document-renderer.js';

const template = 'recommendation-1';
const peer = { id: true, ownerId: true, deletedAt: true, version: true, name: true } as const;
const selection = {
  id: true, version: true, isExample: true, date: true, matchScore: true, whyGoodTransfer: true,
  request: { select: peer },
  player: { select: { ...peer, primaryPosition: true } },
  club: { select: peer },
  person: { select: peer },
} satisfies Prisma.SuggestionSelect;

async function snapshot(tx: Tx, id: string, version: number, language: DocumentContent['language'], today: string) {
  const row = await tx.suggestion.findFirst({ where: { ...live, id }, select: selection });
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (row.version !== version) throw new AppError('STALE_VERSION', 409);
  const { request, player, club, person } = row;
  if ([request, player, club, person].some(record => record.ownerId !== live.ownerId || record.deletedAt)) {
    throw new AppError('NOT_FOUND', 404);
  }
  const labels = language === 'tr' ? tr : en;
  const date = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric',
  });
  const score = row.matchScore === null ? labels.requestNoSuggestionScore : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(row.matchScore.toNumber());
  const content: DocumentContent = {
    language, title: player.name, subtitle: labels.recommendationDocument,
    sections: [
      { heading: labels.Request, lines: [
        request.name,
        `${labels.club} · ${club.name}`,
        `${labels.requestContact} · ${person.name}`,
        `${labels.position} · ${labels[player.primaryPosition]}`,
        `${labels.score} · ${score}`,
        `${labels.recommendationDate} · ${date.format(row.date)}`,
      ] },
      { heading: labels.why, lines: [row.whyGoodTransfer] },
    ],
    footer: labels.documentMetadata.replace('{date}', date.format(new Date(today))).replace('{version}', String(version)).replace('{template}', template),
  };
  const sources = [
    { type: 'Suggestion', id: row.id, version },
    { type: 'Request', id: request.id, version: request.version },
    { type: 'Player', id: player.id, version: player.version },
    { type: 'Club', id: club.id, version: club.version },
    { type: 'Person', id: person.id, version: person.version },
  ];
  const hash = createHash('sha256').update(JSON.stringify({ content, sources })).digest('hex');
  return { content, sources, hash, request, isExample: row.isExample };
}

export async function registerRecommendationDocument(app: FastifyInstance, db: PrismaClient, config: Config) {
  let busy = false;
  app.post('/api/documents/recommendation/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { version, language, format } = documentInput.parse(req.body);
    if (busy) throw new AppError('DOCUMENT_BUSY', 429);
    busy = true;
    try {
      const today = istanbulToday();
      const document = await snapshot(db, id, version, language, today);
      const output = await renderDocument(document.content, format, config.PLAYWRIGHT_EXECUTABLE_PATH);
      await db.$transaction(async tx => {
        const current = await snapshot(tx, id, version, language, today);
        if (current.hash !== document.hash) throw new AppError('STALE_VERSION', 409);
        await logEvent(tx, {
          entityType: 'Request', entityId: document.request.id, name: document.request.name, action: 'export', isExample: document.isExample,
          diffs: { format, language, template, dataDate: today, snapshotHash: document.hash, sourceVersions: document.sources, engine: output.engine },
        });
      }, { isolationLevel: 'Serializable' });
      return reply.header('content-type', output.mime)
        .header('content-disposition', `attachment; filename="metodo-recommendation-${language}.${format}"`)
        .header('x-metodo-document-engine', output.engine)
        .send(output.bytes);
    } finally {
      busy = false;
    }
  });
}
