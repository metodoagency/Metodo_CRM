import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let n = 0; let address = '';
function request(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => { if (!process.env.DATABASE_URL?.endsWith('/metodo_test')) throw new Error('Unsafe test database'); await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(m => `"${m.dbName || m.name}"`).join(',')} CASCADE`); address = `127.10.0.${++n}`; const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(login.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken; });
afterAll(async () => { await app.close(); await db.$disconnect(); });
async function campaign() { const r = await request('POST', '/api/campaigns', { name: 'Örnek Şahin Kampanyası', startDate: null, endDate: null, isExample: true }); expect(r.statusCode).toBe(201); return r.json(); }
describe('sensitive paths: campaign edits and bounded sponsorship board', () => {
  it('edits known dates/name with compare-and-set, provenance and a timeline without changing linked opportunities', async () => {
    const row = await campaign(); const brand = await db.brand.create({ data: { name: 'Örnek Pano Markası', searchName: 'ornek pano markasi', isExample: true } }); const source = await db.sponsorshipOpportunity.create({ data: { name: 'Örnek Pano Fırsatı', searchName: 'ornek pano firsati', brandId: brand.id, campaignId: row.id, stage: 'NEGOTIATION', isExample: true } });
    const payload = { version: 1, name: 'Örnek Güncel Kampanya', startDate: '2026-02-01', endDate: '2026-12-31' }; const r = await request('PATCH', `/api/campaigns/${row.id}`, payload); expect(r.statusCode, r.body).toBe(200); expect(r.json()).toEqual({ ...payload, id: row.id, version: 2, isExample: true });
    expect((await request('GET', `/api/sponsorship/opportunities/${source.id}`)).json()).toMatchObject({ stage: 'NEGOTIATION', version: 1, campaign: { name: payload.name } }); expect((await db.campaign.findUniqueOrThrow({ where: { id: row.id } })).fieldProvenance).toMatchObject({ name: { sourceType: 'MANUAL' } }); expect(await db.timelineEvent.count({ where: { entityType: 'Campaign', entityId: row.id, action: 'update' } })).toBe(1);
    expect((await request('PATCH', `/api/campaigns/${row.id}`, payload)).statusCode).toBe(409);
    const outcomes = await Promise.all(['Örnek Birinci Güncelleme', 'Örnek İkinci Güncelleme'].map(name => request('PATCH', `/api/campaigns/${row.id}`, { ...payload, version: 2, name }))); expect(outcomes.map(r => r.statusCode).sort()).toEqual([200, 409]);
    expect((await request('PATCH', `/api/campaigns/${row.id}`, { ...payload, version: 3, endDate: '2025-01-01' })).statusCode).toBe(400); expect((await request('PATCH', `/api/campaigns/${row.id}`, { ...payload, version: 3, isExample: false })).statusCode).toBe(400);
  });
  it('invalidates stage approval after a Campaign edit and rejects foreign or unavailable Campaign writes', async () => {
    const row = await campaign(); const brand = await db.brand.create({ data: { name: 'Örnek Bağlı Marka', searchName: 'ornek bagli marka' } }); const source = await db.sponsorshipOpportunity.create({ data: { name: 'Örnek Bağlı Fırsat', searchName: 'ornek bagli firsat', brandId: brand.id, campaignId: row.id } });
    const preview = await request('POST', `/api/sponsorship/opportunities/${source.id}/transition/preview`, { targetType: 'SponsorshipOpportunity', targetId: source.id, version: 1, opportunityVersion: 1, stage: 'CONTACT', outcome: null, privateReason: null }); expect(preview.statusCode).toBe(200);
    expect((await request('PATCH', `/api/campaigns/${row.id}`, { version: 1, name: 'Örnek Yeni Kampanya', startDate: null, endDate: null })).statusCode).toBe(200); expect((await request('POST', `/api/sponsorship/opportunities/${source.id}/transition/confirm`, preview.json())).statusCode).toBe(409);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } }); const foreign = await db.campaign.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Kampanya', searchName: 'ornek yabanci kampanya' } }); const changes = { version: 1, name: 'Örnek Geçersiz Değişiklik', startDate: null, endDate: null }; expect((await request('PATCH', `/api/campaigns/${foreign.id}`, changes)).statusCode).toBe(404);
    await db.campaign.update({ where: { id: row.id }, data: { deletedAt: new Date() } }); expect((await request('PATCH', `/api/campaigns/${row.id}`, { ...changes, version: 2 })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: `/api/campaigns/${foreign.id}`, remoteAddress: address, headers: { cookie, origin }, payload: changes })).statusCode).toBe(403);
  });
  it('counts and pages actual stage/search records independently without exposing private action fields', async () => {
    const brand = await db.brand.create({ data: { name: 'Örnek Pano Markası', searchName: 'ornek pano markasi', isExample: true } });
    await db.sponsorshipOpportunity.createMany({ data: Array.from({ length: 52 }, (_, i) => ({ name: `Örnek Şahin Pano ${i}`, searchName: `ornek sahin pano ${i}`, brandId: brand.id, stage: i < 51 ? 'RESEARCH' : 'ACTIVE', privateNextAction: encrypt('private-board-action', 'SponsorshipOpportunity.privateNextAction'), isExample: true })) });
    const first = await request('GET', '/api/sponsorship/opportunities?stage=RESEARCH&q=sahin'); const second = await request('GET', '/api/sponsorship/opportunities?stage=RESEARCH&q=sahin&page=2'); expect(first.json()).toMatchObject({ total: 51, page: 1 }); expect(first.json().items).toHaveLength(50); expect(second.json()).toMatchObject({ total: 51, page: 2 }); expect(second.json().items).toHaveLength(1); expect(first.json().items.some((r: { id: string }) => r.id === second.json().items[0].id)).toBe(false);
    expect((await request('GET', '/api/sponsorship/opportunities?stage=ACTIVE&q=sahin')).json()).toMatchObject({ total: 1 }); expect((await request('GET', '/api/sponsorship/opportunities?stage=NEGOTIATION&q=sahin')).json()).toMatchObject({ total: 0 }); expect(first.body + second.body).not.toMatch(/private-board-action|v1\./);
  });
});
