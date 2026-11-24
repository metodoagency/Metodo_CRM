import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { OpportunityRecord } from '../shared/pipeline.js';
import type { MembershipPlan } from '../shared/sponsorship-membership.js';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import { cleanupExamples, examplePreview } from '../server/lifecycle.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let n = 0; let address = '';
function request(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.endsWith('/metodo_test')) throw new Error('Unsafe test database'); await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(m => `"${m.dbName || m.name}"`).join(',')} CASCADE`); address = `127.9.0.${++n}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(login.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterAll(async () => { await app.close(); await db.$disconnect(); });
async function fixture(exampleResponsible = false) {
  const brand = await db.brand.create({ data: { name: 'Örnek Üyelik Markası', searchName: 'ornek uyelik markasi' } });
  const a = await db.person.create({ data: { name: 'Örnek Önceki Sorumlu', searchName: 'ornek onceki sorumlu', isExample: exampleResponsible, email: encrypt('private-membership@example.com', 'Person.email') } });
  const b = await db.person.create({ data: { name: 'Örnek Yeni Sorumlu', searchName: 'ornek yeni sorumlu' } });
  const contacts = await Promise.all([a, b].map(p => db.brandContact.create({ data: { name: p.name, brandId: brand.id, personId: p.id, isExample: p.isExample } })));
  const players = await Promise.all(['CM', 'CB', 'CF'].map((position, index) => db.player.create({ data: { name: `Örnek Üyelik Oyuncusu ${index + 1}`, searchName: `ornek uyelik oyuncusu ${index + 1}`, primaryPosition: position as 'CM' | 'CB' | 'CF' } })));
  const created = await request('POST', '/api/sponsorship/opportunities', { name: 'Örnek Üyelik Fırsatı', brandId: brand.id, campaignId: null, playerIds: players.slice(0, 2).map(p => p.id), brandContactIds: [], responsiblePersonId: a.id, privateNextAction: null, nextActionDate: null, lastContactDate: null }); expect(created.statusCode, created.body).toBe(201);
  return { brand, a, b, contacts, players, row: created.json<OpportunityRecord>() };
}
async function current(id: string) { return (await request('GET', `/api/sponsorship/opportunities/${id}`)).json<OpportunityRecord>(); }
async function preview(id: string, command: Record<string, unknown>) { const row = await current(id); const result = await request('POST', `/api/sponsorship/opportunities/${id}/membership/preview`, { version: row.version, ...command }); expect(result.statusCode, result.body).toBe(200); return result.json<MembershipPlan>(); }
function confirm(plan: MembershipPlan) { return request('POST', `/api/sponsorship/opportunities/${plan.opportunityId}/membership/confirm`, plan); }
async function change(id: string, command: Record<string, unknown>) { const plan = await preview(id, command); const result = await confirm(plan); expect(result.statusCode, result.body).toBe(200); return result.json<OpportunityRecord>(); }
describe('sensitive paths: previewed sponsorship membership', () => {
  it('previews exact new links without writing and confirms once without changing canonical players or existing outcomes', async () => {
    const { row, players } = await fixture(); const plan = await preview(row.id, { operation: 'ADD_PLAYER', playerId: players[2].id }); expect(plan.changes.map(c => c.model)).toEqual(['OpportunityPlayer', 'SponsorshipStageEvent', 'SponsorshipOpportunity']);
    expect(await db.opportunityPlayer.count()).toBe(2); expect((await confirm(plan)).statusCode).toBe(200); expect((await confirm(plan)).statusCode).toBe(409);
    const next = await current(row.id); expect(next.players).toHaveLength(3); expect(next.players.every(p => p.stage === 'RESEARCH' && p.outcome === 'PENDING')).toBe(true); expect(await db.player.count()).toBe(3);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'ADD_PLAYER', version: next.version, playerId: players[2].id })).json().code).toBe('MEMBERSHIP_EXISTS');
    expect(JSON.stringify(plan)).not.toMatch(/private-membership|v1\./);
  });
  it('preserves a terminal player and private action through unlink, explicit restore and generic Trash restore', async () => {
    const { row } = await fixture(); const p = row.players[0]; const cipher = encrypt('private-retained-action', 'OpportunityPlayer.privateNextAction'); await db.opportunityPlayer.update({ where: { id: p.id }, data: { stage: 'AGREEMENT', outcome: 'WON', privateNextAction: cipher } });
    await change(row.id, { operation: 'REMOVE_PLAYER', linkId: p.id }); expect((await current(row.id)).players).toHaveLength(1); expect(await db.player.count()).toBe(3);
    const duplicate = await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'ADD_PLAYER', version: 2, playerId: p.player!.id }); expect(duplicate.json().code).toBe('MEMBERSHIP_IN_TRASH');
    const restored = await change(row.id, { operation: 'RESTORE_PLAYER', linkId: p.id }); expect(restored.players.find(v => v.id === p.id)).toMatchObject({ stage: 'AGREEMENT', outcome: 'WON', hasPrivateNextAction: true }); expect((await db.opportunityPlayer.findUniqueOrThrow({ where: { id: p.id } })).privateNextAction).toBe(cipher);
    await change(row.id, { operation: 'REMOVE_PLAYER', linkId: p.id }); const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: p.id } }); const record = await db.opportunityPlayer.findUniqueOrThrow({ where: { id: p.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: record.version })).statusCode).toBe(200); expect((await current(row.id)).version).toBe(5);
    const events = await db.sponsorshipStageEvent.findMany({ where: { entityId: p.id } }); expect(events.filter(e => e.kind === 'UNLINK')).toHaveLength(2); expect(events.filter(e => e.kind === 'LINK')).toHaveLength(3);
  });
  it('scopes contacts by brand and participant, preserves unavailable links for explicit removal and checks restore parents', async () => {
    const { row, contacts, a } = await fixture(); const participantId = row.players[0].id;
    const linked = await change(row.id, { operation: 'ADD_CONTACT', brandContactId: contacts[0].id, participantId }); const link = linked.contacts.find(c => c.role === 'BRAND')!; expect(link).toMatchObject({ participantId, brandContactId: contacts[0].id, version: 1 });
    const other = await db.brand.create({ data: { name: 'Örnek Başka Üyelik Markası', searchName: 'ornek baska uyelik markasi' } }); const wrong = await db.brandContact.create({ data: { name: a.name, brandId: other.id, personId: a.id } });
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'ADD_CONTACT', version: linked.version, brandContactId: wrong.id, participantId: null })).statusCode).toBe(404);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'ADD_CONTACT', version: linked.version, brandContactId: contacts[1].id, participantId: other.id })).statusCode).toBe(404);
    await db.person.update({ where: { id: a.id }, data: { deletedAt: new Date(), version: { increment: 1 } } }); await change(row.id, { operation: 'REMOVE_CONTACT', linkId: link.id });
    const blocked = await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'RESTORE_CONTACT', version: 3, linkId: link.id }); expect(blocked.statusCode).toBe(404);
    await db.person.update({ where: { id: a.id }, data: { deletedAt: null, version: { increment: 1 } } }); expect((await change(row.id, { operation: 'RESTORE_CONTACT', linkId: link.id })).contacts.find(c => c.id === link.id)?.person?.id).toBe(a.id);
  });
  it('replaces responsible links independently, blocks old restore while any active slot exists, and explicitly returns work to the owner', async () => {
    const { row, a, b } = await fixture(); const old = row.contacts.find(c => c.role === 'RESPONSIBLE')!; const next = await change(row.id, { operation: 'SET_RESPONSIBLE', personId: b.id }); const active = next.contacts.find(c => c.role === 'RESPONSIBLE')!; expect(active.id).not.toBe(old.id); expect(active.person?.id).toBe(b.id);
    const oldRecord = await db.opportunityContact.findUniqueOrThrow({ where: { id: old.id } }); expect(oldRecord.personId).toBe(a.id); expect(oldRecord.deletedAt).not.toBeNull(); const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: old.id } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: oldRecord.version })).statusCode).toBe(409);
    await db.person.update({ where: { id: b.id }, data: { deletedAt: new Date() } }); expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: oldRecord.version })).statusCode).toBe(409);
    const owner = await change(row.id, { operation: 'SET_RESPONSIBLE', personId: null }); expect(owner.responsibilityMode).toBe('OWNER'); expect(owner.contacts.filter(c => c.role === 'RESPONSIBLE')).toHaveLength(0);
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: oldRecord.version })).statusCode).toBe(200); expect((await current(row.id)).responsibilityMode).toBe('PERSON');
    const events = (await request('GET', `/api/sponsorship/opportunities/${row.id}/history`)).json().items; expect(events).toContainEqual(expect.objectContaining({ entityId: old.id, kind: 'UNLINK', label: a.name })); expect(events).toContainEqual(expect.objectContaining({ entityId: active.id, kind: 'LINK', label: b.name }));
  });
  it('shows an old responsible assignment as an explicit restore instead of silently creating a duplicate', async () => {
    const { row, a, b } = await fixture(); const old = row.contacts.find(c => c.role === 'RESPONSIBLE')!; await change(row.id, { operation: 'SET_RESPONSIBLE', personId: b.id });
    const plan = await preview(row.id, { operation: 'SET_RESPONSIBLE', personId: a.id }); expect(plan.changes).toContainEqual(expect.objectContaining({ model: 'OpportunityContact', operation: 'RESTORE', id: old.id })); expect(plan.changes).toContainEqual(expect.objectContaining({ model: 'OpportunityContact', operation: 'TRASH' })); expect((await confirm(plan)).statusCode).toBe(200);
    const after = await current(row.id); expect(after.contacts.find(c => c.role === 'RESPONSIBLE')?.id).toBe(old.id); expect(await db.opportunityContact.count({ where: { opportunityId: row.id, role: 'RESPONSIBLE' } })).toBe(2);
  });
  it('binds external candidate versions, complete source graph, selected changes, expiry, session and path', async () => {
    const { row, players } = await fixture(); let plan = await preview(row.id, { operation: 'ADD_PLAYER', playerId: players[2].id });
    expect((await confirm({ ...plan, changes: plan.changes.map(c => c.model === 'OpportunityPlayer' ? { ...c, label: 'Örnek Sahte İsim' } : c) })).statusCode).toBe(409);
    expect((await request('POST', `/api/sponsorship/opportunities/${players[2].id}/membership/confirm`, plan)).statusCode).toBe(409);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60000); try { expect((await confirm(plan)).statusCode).toBe(409); } finally { clock.mockRestore(); }
    const savedCookie = cookie; const savedCsrf = csrf; const otherLogin = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(otherLogin.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken; expect((await confirm(plan)).statusCode).toBe(409); cookie = savedCookie; csrf = savedCsrf;
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } }); const foreign = await db.player.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Üyelik', searchName: 'ornek yabanci uyelik', primaryPosition: 'CM' } }); expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/membership/preview`, { operation: 'ADD_PLAYER', version: row.version, playerId: foreign.id })).statusCode).toBe(404);
    await db.player.update({ where: { id: players[2].id }, data: { version: { increment: 1 }, name: 'Örnek Güncel Aday' } }); expect((await confirm(plan)).statusCode).toBe(409); expect(await db.opportunityPlayer.count()).toBe(2);
    plan = await preview(row.id, { operation: 'ADD_PLAYER', playerId: players[2].id }); await db.person.updateMany({ data: { version: { increment: 1 } } }); expect((await confirm(plan)).statusCode).toBe(409);
    const noCsrf = await app.inject({ method: 'POST', url: `/api/sponsorship/opportunities/${row.id}/membership/preview`, remoteAddress: address, headers: { cookie, origin }, payload: { operation: 'ADD_PLAYER', version: 1, playerId: players[2].id } }); expect(noCsrf.statusCode).toBe(403);
  });
  it('commits one concurrent membership change and preserves real shared records when example assignments are cleaned', async () => {
    const { row, a, b, players } = await fixture(true); const first = await preview(row.id, { operation: 'ADD_PLAYER', playerId: players[2].id }); const second = await preview(row.id, { operation: 'SET_RESPONSIBLE', personId: b.id });
    const results = await Promise.all([confirm(first), confirm(second)]); expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    const latest = await current(row.id); if (latest.contacts.find(c => c.role === 'RESPONSIBLE')?.person?.id !== b.id) await change(row.id, { operation: 'SET_RESPONSIBLE', personId: b.id });
    const plan = await db.$transaction(tx => examplePreview(tx)); expect(plan.result.counts.SponsorshipOpportunity).toBeUndefined(); await cleanupExamples(db, plan.result.previewToken);
    expect(await db.person.findUnique({ where: { id: a.id } })).toBeNull(); expect(await db.person.findUnique({ where: { id: b.id } })).not.toBeNull(); const retained = await current(row.id); expect(retained.isExample).toBe(false); expect(retained.contacts.find(c => c.role === 'RESPONSIBLE')?.person?.id).toBe(b.id);
  });
  it('rejects a restore when its Trash entry changes after preview and preserves all original fields', async () => {
    const { row } = await fixture(); const link = row.players[0]; await change(row.id, { operation: 'REMOVE_PLAYER', linkId: link.id }); const plan = await preview(row.id, { operation: 'RESTORE_PLAYER', linkId: link.id });
    await db.trashEntry.updateMany({ where: { entityId: link.id }, data: { version: { increment: 1 } } }); expect((await confirm(plan)).statusCode).toBe(409); expect((await db.opportunityPlayer.findUniqueOrThrow({ where: { id: link.id } })).deletedAt).not.toBeNull();
  });
});
