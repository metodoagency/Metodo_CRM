import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { documentInput, type DocumentContent } from '../shared/documents.js';
import { istanbulToday } from '../shared/domain.js';
import { en, tr } from '../shared/locales.js';
import { fieldSource } from '../shared/provenance.js';
import type { Config } from './config.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { renderDocument } from './document-renderer.js';

const template = 'profile-1';
const peerSelect = { id: true, name: true, version: true, ownerId: true, deletedAt: true } as const;
// A positive selection keeps encrypted fields, free-text notes, contracts and
// image URLs out of the renderer and the document snapshot.
const profileSelect = {
  id: true, name: true, version: true, isExample: true, fieldProvenance: true,
  nationalities: true, heightCm: true, weightKg: true, primaryPosition: true,
  secondaryPositions: true, preferredFoot: true, levelScore: true,
  currentClub: { select: peerSelect }, currentLeague: { select: peerSelect },
} satisfies Prisma.PlayerSelect;

type Profile = Prisma.PlayerGetPayload<{ select: typeof profileSelect }>;
async function profile(tx: Tx, id: string, version: number): Promise<Profile> {
  const row = await tx.player.findFirst({ where: { ...live, id }, select: profileSelect });
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (row.version !== version) throw new AppError('STALE_VERSION', 409);
  return row;
}

function formatProfile(row: Profile, language: DocumentContent['language'], day: string) {
  const labels = language === 'tr' ? tr : en;
  const club = row.currentClub?.ownerId === 'owner' && !row.currentClub.deletedAt ? row.currentClub : null;
  const league = row.currentLeague?.ownerId === 'owner' && !row.currentLeague.deletedAt ? row.currentLeague : null;
  const sourceVersions = [{ type: 'Player', id: row.id, version: row.version }];
  if (club) sourceVersions.push({ type: 'Club', id: club.id, version: club.version });
  if (league) sourceVersions.push({ type: 'League', id: league.id, version: league.version });
  const date = (value: string) => new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'Europe/Istanbul', day: '2-digit', month: language === 'tr' ? '2-digit' : 'short', year: 'numeric' }).format(new Date(value));
  const decimal = (value: { toString(): string } | null) => value === null ? '' : language === 'tr' ? value.toString().replace('.', ',') : value.toString();
  const identity = [
    { field: 'nationalities', label: labels.documentNationalities, value: row.nationalities.join(', ') },
    { field: 'currentClubId', label: labels.club, value: club?.name ?? '' },
    { field: 'currentLeagueId', label: labels.documentLeague, value: league?.name ?? '' },
    { field: 'heightCm', label: labels.documentHeight, value: row.heightCm === null ? '' : String(row.heightCm) },
    { field: 'weightKg', label: labels.documentWeight, value: decimal(row.weightKg) },
  ];
  const positions = [
    { field: 'primaryPosition', label: labels.position, value: labels[row.primaryPosition] },
    { field: 'secondaryPositions', label: labels.documentSecondary, value: row.secondaryPositions.map(position => labels[position]).join(', ') },
    { field: 'preferredFoot', label: labels.documentFoot, value: row.preferredFoot ? { LEFT: labels.documentLeft, RIGHT: labels.documentRight, BOTH: labels.documentBoth }[row.preferredFoot] : '' },
    { field: 'levelScore', label: labels.documentLevel, value: decimal(row.levelScore) },
  ];
  const lines = (fields: typeof identity) => fields.filter(field => field.value).map(field => `${field.label} · ${field.value}`);
  const evidence = row.fieldProvenance && typeof row.fieldProvenance === 'object' && !Array.isArray(row.fieldProvenance) ? row.fieldProvenance : {};
  const sources = [{ field: 'name', label: labels.name, value: row.name }, ...identity, ...positions].flatMap(field => {
    const source = fieldSource.safeParse(evidence[field.field]);
    if (!field.value || !source.success || !source.data.sourceUrl) return [];
    return [`${field.label} · ${source.data.sourceUrl} · ${date(source.data.retrievedAt)}`];
  });
  const content: DocumentContent = {
    language, title: row.name, subtitle: labels.profileDocument,
    sections: [
      { heading: labels.documentIdentity, lines: lines(identity) },
      { heading: labels.documentPositions, lines: lines(positions) },
      { heading: labels.documentSources, lines: sources.length ? sources : [labels.documentManual] },
    ].filter(section => section.lines.length),
    footer: labels.documentMetadata.replace('{date}', date(`${day}T00:00:00Z`)).replace('{version}', String(row.version)).replace('{template}', template),
  };
  const hash = createHash('sha256').update(JSON.stringify({ content, sourceVersions })).digest('hex');
  return { content, sourceVersions, hash };
}

export async function registerProfileDocument(app: FastifyInstance, db: PrismaClient, config: Config) {
  let busy = false;
  app.post('/api/documents/profile/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const input = documentInput.parse(req.body);
    if (busy) throw new AppError('DOCUMENT_BUSY', 429);
    busy = true;
    try {
      const day = istanbulToday();
      const row = await profile(db, id, input.version);
      const snapshot = formatProfile(row, input.language, day);
      const rendered = await renderDocument(snapshot.content, input.format, config.PLAYWRIGHT_EXECUTABLE_PATH);
      await db.$transaction(async tx => {
        const current = formatProfile(await profile(tx, id, input.version), input.language, day);
        if (current.hash !== snapshot.hash) throw new AppError('STALE_VERSION', 409);
        await logEvent(tx, {
          entityType: 'Player', entityId: id, action: 'export', name: row.name, isExample: row.isExample,
          diffs: { format: input.format, language: input.language, template, dataDate: day, snapshotHash: snapshot.hash, sourceVersions: snapshot.sourceVersions, engine: rendered.engine },
        });
      }, { isolationLevel: 'Serializable' });
      return reply.header('content-type', rendered.mime)
        .header('content-disposition', `attachment; filename="metodo-profile-${input.language}.${input.format}"`)
        .header('x-metodo-document-engine', rendered.engine)
        .send(rendered.bytes);
    } finally {
      busy = false;
    }
  });
}
