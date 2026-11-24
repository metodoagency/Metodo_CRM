import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { decrypt, encrypt, keyring } from '../server/crypto.js';
import { cleanupExamples, examplePreview } from '../server/lifecycle.js';
import { createLogger } from '../server/logging.js';
import type { OpportunityRecord } from '../shared/pipeline.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let n = 0; let address = '';
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
async function login() { const res = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(res.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken; }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => { if (!process.env.DATABASE_URL?.endsWith('/metodo_test')) throw new Error('Unsafe test database'); await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(m => `"${m.dbName || m.name}"`).join(',')} CASCADE`); address = `127.8.0.${++n}`; await login(); });
afterAll(async () => { await app.close(); await db.$disconnect(); });
async function fixture(examplePlayer = false) {
  const brand = await db.brand.create({ data: { name: 'Örnek Marka', searchName: 'ornek marka' } });
  const person = await db.person.create({ data: { name: 'Örnek Marka Kişisi', searchName: 'ornek marka kisisi', phone: encrypt('private-phone', 'Person.phone') } });
  const contact = await db.brandContact.create({ data: { name: person.name, brandId: brand.id, personId: person.id, roleTitle: 'Örnek İrtibat' } });
  const a = await db.player.create({ data: { name: 'Örnek Birinci Oyuncu', searchName: 'ornek birinci oyuncu', primaryPosition: 'CM', isExample: examplePlayer } });
  const b = await db.player.create({ data: { name: 'Örnek İkinci Oyuncu', searchName: 'ornek ikinci oyuncu', primaryPosition: 'CB' } });
  const campaign = await request('POST', '/api/campaigns', { name: 'Örnek Şahin Kampanyası', startDate: '2026-01-01', endDate: '2026-12-31' }); expect(campaign.statusCode, campaign.body).toBe(201);
  const payload = { name: 'Örnek Şahin Fırsatı', brandId: brand.id, campaignId: campaign.json().id, playerIds: [a.id, b.id], brandContactIds: [contact.id], responsiblePersonId: person.id, privateNextAction: 'private-next-action', nextActionDate: '2026-12-01', lastContactDate: null };
  const created = await request('POST', '/api/sponsorship/opportunities', payload); expect(created.statusCode, created.body).toBe(201);
  return { brand, person, contact, a, b, payload, row: created.json<OpportunityRecord>(), campaign: campaign.json() };
}
async function preview(row: OpportunityRecord, playerId?: string, stage = 'NEGOTIATION', outcome = 'PENDING', privateReason: string | null = null) {
  const player = row.players.find(p => p.id === playerId); const response = await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/preview`, { targetType: player ? 'OpportunityPlayer' : 'SponsorshipOpportunity', targetId: player?.id ?? row.id, version: player?.version ?? row.version, opportunityVersion: row.version, stage, outcome: player ? outcome : null, privateReason });
  expect(response.statusCode, response.body).toBe(200); return response.json();
}
async function purgePerson(id: string) {
  expect((await request('DELETE', `/api/records/Person/${id}`, { version: 1 })).statusCode).toBe(200); const trash = await db.trashEntry.findFirstOrThrow({ where: { entityType: 'Person', entityId: id } });
  const plan = (await request('GET', `/api/trash/${trash.id}/preview`)).json(); expect(plan.canPurge).toBe(true); expect(plan.counts.SponsorshipOpportunity).toBeUndefined();
  expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: 2, previewToken: plan.previewToken })).statusCode).toBe(200);
}
describe('sensitive paths: multi-player sponsorship pipeline', () => {
  it('creates one shared campaign and independent players with existing brand contacts; returns safe metadata only', async () => {
    const { row, brand, person, a, b } = await fixture(); expect(row).toMatchObject({ stage: 'RESEARCH', version: 1, nextActionDate: '2026-12-01', lastContactDate: null, responsibilityMode: 'PERSON', hasPrivateNextAction: true, brand: { id: brand.id } });
    expect(row.players.map(p => p.player?.id).sort()).toEqual([a.id, b.id].sort()); expect(row.contacts.map(c => c.person?.id)).toEqual([person.id, person.id]);
    const stored = await db.sponsorshipOpportunity.findUniqueOrThrow({ where: { id: row.id } }); expect(stored.privateNextAction).not.toContain('private-next-action'); expect(decrypt(stored.privateNextAction!, 'SponsorshipOpportunity.privateNextAction')).toBe('private-next-action');
    for (const path of ['/api/sponsorship/opportunities?q=sahin', `/api/sponsorship/opportunities/${row.id}`, `/api/sponsorship/opportunities/${row.id}/history`]) { const result = await request('GET', path); expect(result.statusCode).toBe(200); expect(result.body).not.toMatch(/private-next-action|private-phone|v1\.|ownerId/); expect(result.headers['cache-control']).toBe('no-store'); }
    expect((await request('GET', '/api/campaigns?q=sahin')).json()).toMatchObject({ total: 1, items: [{ startDate: '2026-01-01', endDate: '2026-12-31' }] });
    expect((await request('POST', '/api/campaigns', { name: 'Örnek Hatalı', startDate: '2026-03-01', endDate: '2026-02-01' })).statusCode).toBe(400);
  });
  it('does not write before approval; changes only the selected player and encrypts reasons with value-free access logs', async () => {
    const { row } = await fixture(); const player = row.players[0]; const plan = await preview(row, player.id, 'AGREEMENT', 'WON', 'private-win-reason');
    expect((await db.opportunityPlayer.findUniqueOrThrow({ where: { id: player.id } })).outcome).toBe('PENDING'); expect(await db.sponsorshipStageEvent.count({ where: { kind: 'TRANSITION' } })).toBe(0);
    const result = await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan); expect(result.statusCode, result.body).toBe(200); const next = result.json<OpportunityRecord>();
    expect(next.stage).toBe('RESEARCH'); expect(next.players.find(p => p.id === player.id)?.outcome).toBe('WON'); expect(next.players.find(p => p.id !== player.id)?.outcome).toBe('PENDING');
    const event = await db.sponsorshipStageEvent.findUniqueOrThrow({ where: { id: plan.eventId } }); expect(decrypt(event.privateReason!, 'SponsorshipStageEvent.privateReason')).toBe('private-win-reason'); expect(result.body).not.toContain(event.privateReason!);
    const reveal = await request('POST', `/api/sponsorship/opportunities/${row.id}/reveal`, { type: 'SponsorshipStageEvent', id: event.id, version: next.version }); expect(reveal.json().value).toBe('private-win-reason');
    const logs = JSON.stringify([await db.timelineEvent.findMany(), await db.auditLog.findMany()]); expect(logs).not.toMatch(/private-win-reason|private-next-action/); expect(logs).toContain('***'); expect((await request('GET', '/api/admin/access-log')).json().items).toContainEqual(expect.objectContaining({ field: 'privateReason', entityId: event.id }));
    const overall = await preview(next, undefined, 'LOST', 'PENDING', 'private-global-reason'); const changed = (await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, overall)).json<OpportunityRecord>(); expect(changed.players).toEqual(next.players);
  });
  it('rejects forged, path-substituted, expired, other-session and replayed approvals; a concurrent approval commits once', async () => {
    const { row } = await fixture(); const plan = await preview(row);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, { ...plan, after: { ...plan.after, stage: 'ACTIVE' } })).statusCode).toBe(409);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.players[0].id}/transition/confirm`, plan)).statusCode).toBe(409);
    const savedCookie = cookie; const savedCsrf = csrf; await login(); expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(409); cookie = savedCookie; csrf = savedCsrf;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60000); try { expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(409); } finally { clock.mockRestore(); }
    const results = await Promise.all([request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan), request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)]); expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(409); expect(await db.sponsorshipStageEvent.count({ where: { kind: 'TRANSITION' } })).toBe(1);
  });
  it('binds the whole link graph so generic contact purge invalidates an old preview without deleting the opportunity', async () => {
    const { row, person } = await fixture(); const plan = await preview(row); await purgePerson(person.id);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(409);
    const retained = (await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json<OpportunityRecord>(); expect(retained.version).toBe(row.version); expect(retained.players).toHaveLength(2); expect(retained.contacts).toHaveLength(0); expect(retained.responsibilityMode).toBe('PERSON');
    expect(await db.sponsorshipStageEvent.count({ where: { entityType: 'SponsorshipOpportunity' } })).toBe(1);
  });
  it('preserves the shared opportunity and second player when purging one player; blocks private history reveal for deleted targets', async () => {
    const { row } = await fixture(); const player = row.players[0]; const plan = await preview(row, player.id, 'LOST', 'LOST', 'private-loss-reason'); const changed = (await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).json<OpportunityRecord>();
    expect((await request('DELETE', `/api/records/Player/${player.player!.id}`, { version: 1 })).statusCode).toBe(200);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/reveal`, { type: 'SponsorshipStageEvent', id: plan.eventId, version: changed.version })).statusCode).toBe(404);
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityType: 'Player' } }); const p = (await request('GET', `/api/trash/${trash.id}/preview`)).json(); expect(p.canPurge).toBe(true);
    expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: 2, previewToken: p.previewToken })).statusCode).toBe(200);
    expect((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json().players).toHaveLength(1); expect(await db.sponsorshipStageEvent.count({ where: { entityType: 'SponsorshipOpportunity' } })).toBe(1); expect(await db.sponsorshipStageEvent.count({ where: { entityId: player.id } })).toBe(0);
  });
  it('validates terminal reasons, duplicates, foreign owners, mismatched brand contacts, live parents and CSRF', async () => {
    const { row, payload, contact } = await fixture();
    const invalidTransition = { targetType: 'SponsorshipOpportunity', targetId: row.id, version: 1, opportunityVersion: 1, stage: 'LOST', outcome: null, privateReason: null };
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/preview`, invalidTransition)).statusCode).toBe(400);
    expect((await request('POST', '/api/sponsorship/opportunities', { ...payload, playerIds: [payload.playerIds[0], payload.playerIds[0]] })).statusCode).toBe(400);
    const second = await db.brand.create({ data: { name: 'Örnek Başka Marka', searchName: 'ornek baska marka' } }); expect((await request('POST', '/api/sponsorship/opportunities', { ...payload, brandId: second.id })).statusCode).toBe(404);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } }); const foreign = await db.player.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Oyuncu', searchName: 'ornek yabanci oyuncu', primaryPosition: 'CM' } }); expect((await request('POST', '/api/sponsorship/opportunities', { ...payload, playerIds: [foreign.id] })).statusCode).toBe(404);
    await db.brandContact.update({ where: { id: contact.id }, data: { deletedAt: new Date() } }); expect((await request('POST', '/api/sponsorship/opportunities', payload)).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/sponsorship/opportunities', remoteAddress: address, headers: { cookie, origin }, payload })).statusCode).toBe(403);
    await db.campaign.update({ where: { id: payload.campaignId }, data: { deletedAt: new Date() } }); expect((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).statusCode).toBe(404);
  });
  it('keeps protected history outside retention and restores opportunities only with live grandparents', async () => {
    const { row, brand, campaign } = await fixture(); const catalog = (await request('GET', '/api/admin/retention')).json(); expect(catalog.tables).toContainEqual({ type: 'SponsorshipStageEvent', mode: 'protected' });
    expect((await request('POST', '/api/admin/retention/preview', { table: 'SponsorshipStageEvent' })).statusCode).toBe(400);
    expect((await request('DELETE', `/api/campaigns/${campaign.id}`, { version: 1 })).statusCode).toBe(200); const campaignTrash = await db.trashEntry.findFirstOrThrow({ where: { entityId: campaign.id } }); expect((await request('GET', `/api/trash/${campaignTrash.id}/preview`)).json().canPurge).toBe(false);
    expect((await request('POST', `/api/trash/${campaignTrash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(200);
    expect((await request('DELETE', `/api/sponsorship/opportunities/${row.id}`, { version: 1 })).statusCode).toBe(200); const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: row.id } });
    await db.brand.update({ where: { id: brand.id }, data: { deletedAt: new Date() } }); expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(409);
    await db.brand.update({ where: { id: brand.id }, data: { deletedAt: null } }); expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(200);
    expect((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json().players).toHaveLength(2);
  });
  it('cleans example players and their link history without marking or erasing a real shared opportunity', async () => {
    const { row, a, b } = await fixture(true); expect(row.isExample).toBe(false); const p = await db.$transaction(tx => examplePreview(tx)); expect(p.result.counts.SponsorshipOpportunity).toBeUndefined(); await cleanupExamples(db, p.result.previewToken);
    expect(await db.sponsorshipOpportunity.findUnique({ where: { id: row.id } })).not.toBeNull(); expect(await db.player.findUnique({ where: { id: a.id } })).toBeNull(); expect(await db.player.findUnique({ where: { id: b.id } })).not.toBeNull(); expect(await db.opportunityPlayer.count()).toBe(1);
  });
  it('updates next actions sparsely, preserves omitted ciphertext, requires current versions and separates player metadata', async () => {
    const { row } = await fixture(); const stored = await db.sponsorshipOpportunity.findUniqueOrThrow({ where: { id: row.id } });
    const command = { targetType: 'SponsorshipOpportunity', targetId: row.id, version: 1, opportunityVersion: 1, changes: { nextActionDate: '2026-12-03', lastContactDate: '2026-11-01' } };
    const updated = await request('PATCH', `/api/sponsorship/opportunities/${row.id}/details`, command); expect(updated.statusCode, updated.body).toBe(200); expect((await db.sponsorshipOpportunity.findUniqueOrThrow({ where: { id: row.id } })).privateNextAction).toBe(stored.privateNextAction);
    expect((await request('PATCH', `/api/sponsorship/opportunities/${row.id}/details`, command)).statusCode).toBe(409);
    const player = row.players[0]; const own = await request('PATCH', `/api/sponsorship/opportunities/${row.id}/details`, { targetType: 'OpportunityPlayer', targetId: player.id, version: 1, opportunityVersion: 2, changes: { privateNextAction: 'private-player-next', nextActionDate: '2026-12-04' } }); expect(own.statusCode, own.body).toBe(200);
    const next = own.json<OpportunityRecord>(); expect(next.stage).toBe('RESEARCH'); expect(next.nextActionDate).toBe('2026-12-03'); expect(next.players.find(p => p.id === player.id)).toMatchObject({ version: 2, nextActionDate: '2026-12-04', hasPrivateNextAction: true });
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/reveal`, { type: 'OpportunityPlayer', id: player.id, version: next.version })).json().value).toBe('private-player-next');
    expect((await request('PATCH', `/api/sponsorship/opportunities/${row.id}/details`, { targetType: 'OpportunityPlayer', targetId: player.id, version: 2, opportunityVersion: 3, changes: { lastContactDate: '2026-01-01' } })).statusCode).toBe(400);
    const cleared = await request('PATCH', `/api/sponsorship/opportunities/${row.id}/details`, { targetType: 'SponsorshipOpportunity', targetId: row.id, version: 3, opportunityVersion: 3, changes: { privateNextAction: null } }); expect(cleared.json().hasPrivateNextAction).toBe(false);
    expect(JSON.stringify(await db.auditLog.findMany())).not.toContain('private-player-next');
    await db.sponsorshipOpportunity.update({ where: { id: row.id }, data: { privateNextAction: '' } }); expect((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json().hasPrivateNextAction).toBe(true);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/reveal`, { type: 'SponsorshipOpportunity', id: row.id, version: 4 })).statusCode).toBe(500);
  });
  it('restores a player link only when its opportunity grandparents are live and invalidates existing approvals', async () => {
    const { row, brand } = await fixture(); const child = row.players[0]; const deletedAt = new Date(); await db.opportunityPlayer.update({ where: { id: child.id }, data: { deletedAt, version: { increment: 1 } } });
    const trash = await db.trashEntry.create({ data: { entityType: 'OpportunityPlayer', entityId: child.id, label: 'Örnek Silinmiş Bağ', expiresAt: deletedAt } });
    await db.brand.update({ where: { id: brand.id }, data: { deletedAt } }); expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(409);
    await db.brand.update({ where: { id: brand.id }, data: { deletedAt: null } }); const plan = await preview((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json());
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: 1, recordVersion: 2 })).statusCode).toBe(200);
    expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(409); expect((await request('GET', `/api/sponsorship/opportunities/${row.id}`)).json().version).toBe(2);
  });
  it('rotates all new ciphertext fields including protected history without leaking private values to logs', async () => {
    const { row } = await fixture(); const plan = await preview(row, row.players[0].id, 'LOST', 'LOST', 'private-rotation-reason'); expect((await request('POST', `/api/sponsorship/opportunities/${row.id}/transition/confirm`, plan)).statusCode).toBe(200);
    await db.opportunityPlayer.update({ where: { id: row.players[1].id }, data: { privateNextAction: encrypt('private-player-action', 'OpportunityPlayer.privateNextAction') } });
    const ring = keyring(); const next = randomBytes(32).toString('base64'); const rotation = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/keys-rotate.ts'], { encoding: 'utf8', env: { ...process.env, FIELD_ENCRYPTION_KEY_ID: 'pipeline-rotated', FIELD_ENCRYPTION_KEY: next, FIELD_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify(ring.keys), BLIND_INDEX_KEY: ring.blind } }); expect(rotation.status, rotation.stderr).toBe(0);
    const rotated = { ...ring, active: 'pipeline-rotated', keys: { ...ring.keys, 'pipeline-rotated': next } }; const event = await db.sponsorshipStageEvent.findUniqueOrThrow({ where: { id: plan.eventId } }); expect(event.version).toBe(2); expect(decrypt(event.privateReason!, 'SponsorshipStageEvent.privateReason', rotated)).toBe('private-rotation-reason');
    expect(decrypt((await db.sponsorshipOpportunity.findUniqueOrThrow({ where: { id: row.id } })).privateNextAction!, 'SponsorshipOpportunity.privateNextAction', rotated)).toBe('private-next-action'); expect(decrypt((await db.opportunityPlayer.findUniqueOrThrow({ where: { id: row.players[1].id } })).privateNextAction!, 'OpportunityPlayer.privateNextAction', rotated)).toBe('private-player-action');
    let output = ''; createLogger({ write: chunk => { output += chunk; } }).info({ privateReason: 'private-reason', details: { privateNextAction: 'private-action' } }); expect(output + rotation.stdout).not.toMatch(/private-reason|private-action|private-rotation-reason|private-player-action|private-next-action/);
  });
});
