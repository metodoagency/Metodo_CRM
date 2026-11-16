import { Prisma, type PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { clubNoteInput, clubSectionParams, clubSectionQuery, type ClubSectionRow } from '../shared/club-network.js';
import { idParams } from '../shared/contracts.js';
import { manualSourceUrl } from '../shared/club-sources.js';
import { live, logEvent, requireEntity } from './core.js';

function httpUrl(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

const named = { id: true, name: true } as const;
const newest = [{ createdAt: 'desc' }, { id: 'asc' }] as const;
const dateText = (date: Date | null) => date?.toISOString() ?? null;

export async function registerClubSections(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/clubs/:id/sections/:section', async req => {
    const { id, section } = clubSectionParams.parse(req.params);
    const { page, players } = clubSectionQuery.parse(req.query);
    await requireEntity(db, 'Club', id);
    const paging = { take: 51, skip: (page - 1) * 50 };
    const club = { ...live, clubId: id };
    let rows: ClubSectionRow[];
    switch (section) {
      case 'staff': {
        const tenures = await db.$queryRaw<{ id: string; personId: string; name: string; role: string; startDate: Date | null; endDate: Date | null; sourceUrl: string | null; verificationStatus: string }[]>(
          Prisma.sql`SELECT r.id, p.id AS "personId", p.name, COALESCE(r.role, p.role::text) AS role, r."startDate", r."endDate", r."sourceUrl", r."verificationStatus"::text
            FROM "Relation" r JOIN "Person" p ON p.id::text = r."fromId"
            WHERE r."ownerId" = 'owner' AND p."ownerId" = 'owner' AND r."deletedAt" IS NULL AND p."deletedAt" IS NULL
              AND r."fromType" = 'Person' AND r."toType" = 'Club' AND r."toId" = ${id} AND r.relation = 'memberOf'
            ORDER BY r."endDate" DESC NULLS FIRST, r."startDate" DESC NULLS LAST, r.id
            LIMIT ${paging.take} OFFSET ${paging.skip}`,
        );
        rows = tenures.map(item => ({ id: item.id, name: item.name, label: item.role, date: dateText(item.startDate), endDate: dateText(item.endDate), href: `/record/Person/${item.personId}`,
          sourceUrl: item.sourceUrl && manualSourceUrl.safeParse(item.sourceUrl).success ? item.sourceUrl : undefined, verificationStatus: item.verificationStatus }));
        break;
      }
      case 'ageTeams':
        rows = (await db.ageTeam.findMany({ ...paging, where: club, orderBy: [...newest], select: { ...named, ageCategory: true } }))
          .map(row => ({ ...row, label: row.ageCategory }));
        break;
      case 'players': {
        const scopes: Record<typeof players, Prisma.PlayerWhereInput> = {
          squad: { currentClubId: id },
          suggested: { suggestions: { some: club } },
          sales: { salesListings: { some: club } },
          mandated: { mandateLinks: { some: club } },
        };
        rows = (await db.player.findMany({ ...paging, where: { ...live, ...scopes[players] }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { ...named, primaryPosition: true } }))
          .map(row => ({ ...row, label: row.primaryPosition, href: `/record/Player/${row.id}` }));
        break;
      }
      case 'requests':
        rows = (await db.request.findMany({ ...paging, where: club, orderBy: [...newest], select: { ...named, status: true } }))
          .map(row => ({ ...row, label: row.status, href: `/record/Request/${row.id}` }));
        break;
      case 'updates':
        rows = (await db.updateProposal.findMany({ ...paging, where: { ...live, targetType: 'Club', targetId: id }, orderBy: [...newest], select: { ...named, approvalStatus: true, date: true, summary: true, type: true, sourceUrl: true, verificationStatus: true } }))
          .map(row => ({ id: row.id, name: row.name, label: row.approvalStatus, date: dateText(row.date),
            details: row.type !== 'injury' ? row.summary : undefined, href: row.approvalStatus === 'PENDING' ? '/proposals' : undefined,
            sourceUrl: row.sourceUrl && manualSourceUrl.safeParse(row.sourceUrl).success ? row.sourceUrl : undefined, verificationStatus: row.verificationStatus }));
        break;
      case 'relationship': {
        const participants = JSON.stringify([{ type: 'Club', id }]);
        const activity = await db.$queryRaw<{ id: string; name: string; nameEn: string; label: string | null; date: Date }[]>(
          Prisma.sql`WITH first_contact AS (
            SELECT r.id::text, p.name, COALESCE(r."startDate", r."createdAt") AS date
            FROM "Relation" r JOIN "Person" p ON p.id::text = CASE WHEN r."fromType" = 'Person' THEN r."fromId" ELSE r."toId" END
            WHERE r."ownerId" = 'owner' AND p."ownerId" = 'owner' AND r."deletedAt" IS NULL AND p."deletedAt" IS NULL
              AND r.relation = 'contactOf' AND (
                (r."fromType" = 'Person' AND r."toType" = 'Club' AND r."toId" = ${id}) OR
                (r."toType" = 'Person' AND r."fromType" = 'Club' AND r."fromId" = ${id}))
            ORDER BY date, r.id LIMIT 1
          )
          SELECT * FROM (
            SELECT t.id::text, t."summaryTr" AS name, t."summaryEn" AS "nameEn", NULL::text AS label, t."createdAt" AS date
            FROM "TimelineEvent" t WHERE t."ownerId" = 'owner' AND t."deletedAt" IS NULL AND t."entityType" = 'Club' AND t."entityId" = ${id}
            UNION ALL SELECT m.id::text, m.name, m.name, 'clubMeetings', m.date
            FROM "Meeting" m WHERE m."ownerId" = 'owner' AND m."deletedAt" IS NULL AND m.participants @> ${participants}::jsonb
            UNION ALL SELECT p.id::text, p.name, p.name, 'clubPresentation', p.date
            FROM "Presentation" p WHERE p."ownerId" = 'owner' AND p."deletedAt" IS NULL AND p."clubId" = ${id}::uuid
            UNION ALL SELECT id, name, name, 'clubFirstContact', date FROM first_contact
          ) activity ORDER BY date DESC, id LIMIT ${paging.take} OFFSET ${paging.skip}`,
        );
        rows = activity.map(row => ({ ...row, label: row.label ?? undefined, date: dateText(row.date) }));
        break;
      }
      case 'meetings':
        rows = (await db.meeting.findMany({ ...paging, where: { ...live, participants: { array_contains: [{ type: 'Club', id }] } }, orderBy: [{ date: 'desc' }, { id: 'asc' }], select: { ...named, date: true, time: true } }))
          .map(row => ({ id: row.id, name: row.name, date: dateText(row.date), details: row.time }));
        break;
      case 'notes':
        rows = (await db.note.findMany({ ...paging, where: { ...live, entityType: 'Club', entityId: id }, orderBy: [...newest], select: { id: true, text: true, createdAt: true } }))
          .map(row => ({ id: row.id, name: row.text, date: dateText(row.createdAt) }));
        break;
      case 'sources':
        rows = (await db.source.findMany({ ...paging, where: { ...live, linkedClubIds: { has: id } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { ...named, url: true, type: true } }))
          .map(row => ({ id: row.id, name: row.name, href: manualSourceUrl.safeParse(row.url).success ? row.url : undefined, external: true, label: `sourceType_${row.type}` }));
        break;
      case 'stakeholders':
        rows = (await db.clubStakeholder.findMany({ ...paging, where: { ...club, person: { is: live } }, orderBy: [...newest], select: { ...named, personId: true, stakeholderRole: true } }))
          .map(row => ({ id: row.id, name: row.name, label: row.stakeholderRole, href: `/record/Person/${row.personId}` }));
        break;
      case 'finance':
        rows = (await db.clubFinancialProfile.findMany({ ...paging, where: club, orderBy: [...newest], select: { ...named, period: true, value: true, currency: true, sourceUrl: true } }))
          .map(row => ({ id: row.id, name: row.name, details: `${row.period} · ${row.value.toFixed(2)} ${row.currency}`, href: row.sourceUrl ? httpUrl(row.sourceUrl) : undefined, external: true }));
        break;
    }
    return { items: rows.slice(0, 50), more: rows.length > 50, page };
  });

  app.post('/api/clubs/:id/notes', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { text } = clubNoteInput.parse(req.body);
    const note = await db.$transaction(async tx => {
      const club = await requireEntity(tx, 'Club', id);
      const row = await tx.note.create({ data: { entityType: 'Club', entityId: id, text, isExample: club.isExample } });
      await logEvent(tx, { entityType: 'Club', entityId: id, action: 'note', name: club.name, isExample: club.isExample, diffs: { noteId: row.id } });
      return { id: row.id };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(note);
  });
}
