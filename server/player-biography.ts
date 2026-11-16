import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import sanitizeHtml from 'sanitize-html';
import { manualSourceUrl } from '../shared/club-sources.js';
import { idParams } from '../shared/contracts.js';
import { biographyWrite, maxBiographyHtml } from '../shared/player-biography.js';
import { provenanceFor } from '../shared/provenance.js';
import { AppError, live, logEvent } from './core.js';

export function cleanBiography(html: string) {
  const cleaned = sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'h3', 'h4', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https'], allowProtocolRelative: false, nestingLimit: 16,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'svg', 'math', 'template'],
    transformTags: {
      h1: 'h3', h2: 'h3', b: 'strong', i: 'em',
      a: (_tag, attributes): sanitizeHtml.Tag => {
        const href = manualSourceUrl.safeParse(attributes.href);
        return href.success ? { tagName: 'a', attribs: { href: new URL(href.data).href, rel: 'noopener noreferrer', target: '_blank' } }
          : { tagName: 'span', attribs: {} };
      },
    },
  }).trim();
  // Text stored before the editor existed keeps its line breaks when opened.
  if (!cleaned || cleaned.includes('<')) return cleaned;
  return cleaned.split(/\r?\n(?:\r?\n)+/).map(paragraph => `<p>${paragraph.replace(/\r?\n/g, '<br />')}</p>`).join('');
}

export async function registerPlayerBiographies(app: FastifyInstance, db: PrismaClient) {
  app.patch('/api/players/:id/biography', async req => {
    const { id } = idParams.parse(req.params);
    const { version, html } = biographyWrite.parse(req.body);
    const bio = cleanBiography(html);
    if (bio.length > maxBiographyHtml) throw new AppError('BIOGRAPHY_TOO_LONG');
    return db.$transaction(async tx => {
      const player = await tx.player.findFirst({ where: { ...live, id }, select: { version: true, name: true, isExample: true, bio: true, fieldProvenance: true } });
      if (!player) throw new AppError('NOT_FOUND', 404);
      if (player.version !== version) throw new AppError('STALE_VERSION', 409);
      const updated = await tx.player.update({ where: { ...live, id, version }, data: {
        bio, fieldProvenance: provenanceFor({ bio }, player.fieldProvenance), version: { increment: 1 },
      }, select: { version: true, bio: true } });
      await logEvent(tx, { entityType: 'Player', entityId: id, action: 'player_biography', name: player.name, isExample: player.isExample,
        diffs: { old: { hasBiography: !!player.bio }, new: { hasBiography: !!bio } } });
      return updated;
    }, { isolationLevel: 'Serializable' });
  });
}
