import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import { cleanupExamples, examplePreview } from '../server/lifecycle.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let index = 0; let address = '';
function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) { return app.inject({ method, url, remoteAddress: address, headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.endsWith('/metodo_test')) throw new Error('Unsafe test database');
  await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(',')} CASCADE`); address = `127.7.0.${++index}`;
  const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } }); cookie = String(login.headers['set-cookie']).split(';')[0];
  csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterAll(async () => { await app.close(); await db.$disconnect(); });
async function create(name = 'Örnek Şahin Markası', isExample = false) { const response = await request('POST', '/api/brands', { name, sector: 'Örnek spor', website: 'https://example.com/brand', relationStatus: 'NEW', isExample }); expect(response.statusCode, response.body).toBe(201); return response.json(); }
async function person(isExample = false) { return db.person.create({ data: { name: 'Örnek Marka İrtibatı', searchName: 'ornek marka irtibati', role: 'OTHER', email: encrypt('sensitive@example.com', 'Person.email'), isExample } }); }
const details = { roleTitle: 'Örnek Pazarlama Sorumlusu', startDate: '2026-01-01', endDate: null };
async function attach(brandId: string, personId: string) { const version = (await request('GET', `/api/brands/${brandId}`)).json().version; const response = await request('POST', `/api/brands/${brandId}/contacts`, { version, personId, details }); expect(response.statusCode, response.body).toBe(201); return response.json(); }
async function version(brandId: string) { return (await request('GET', `/api/brands/${brandId}`)).json().version; }
async function purge(type: 'Brand' | 'Person', id: string) {
  const record = type === 'Brand' ? await db.brand.findUniqueOrThrow({ where: { id } }) : await db.person.findUniqueOrThrow({ where: { id } });
  if (type === 'Person') expect((await request('DELETE', `/api/records/Person/${id}`, { version: record.version })).statusCode).toBe(200);
  else expect((await request('DELETE', `/api/brands/${id}`, { version: record.version })).statusCode).toBe(200);
  const trash = await db.trashEntry.findFirstOrThrow({ where: { entityType: type, entityId: id } }); const preview = (await request('GET', `/api/trash/${trash.id}/preview`)).json(); expect(preview.canPurge).toBe(true);
  expect((await request('DELETE', `/api/trash/${trash.id}`, { version: trash.version, recordVersion: record.version + 1, previewToken: preview.previewToken })).statusCode).toBe(200);
}
describe('sensitive paths: private brand directory', () => {
  it('stores sourced metadata, searches Turkish names and links safe Person metadata without duplicating private contacts', async () => {
    const brand = await create(); const contact = await person(); const link = await attach(brand.id, contact.id);
    expect(link).toMatchObject({ version: 1, startDate: '2026-01-01', endDate: null, person: { id: contact.id, name: contact.name } }); expect(link.person).not.toHaveProperty('email');
    const result = await request('GET', '/api/brands?q=sahin'); expect(result.json()).toMatchObject({ total: 1, items: [{ id: brand.id, version: 2, contactCount: 1 }] }); expect(result.body).not.toContain('sensitive@example.com'); expect(result.body).not.toContain('ownerId');
    expect((await request('GET', `/api/brands/${brand.id}/contacts`)).body).not.toContain(contact.email);
    const events = await db.timelineEvent.findMany({ where: { entityType: { in: ['Brand', 'Person', 'BrandContact'] }, batchId: (await db.timelineEvent.findFirstOrThrow({ where: { entityType: 'BrandContact', entityId: link.id } })).batchId } }); expect(events).toHaveLength(3);
    expect((await db.brand.findUniqueOrThrow({ where: { id: brand.id } })).fieldProvenance).toMatchObject({ sector: { sourceType: 'MANUAL' } });
    expect((await request('PATCH', `/api/brands/${brand.id}`, { version: 1, changes: { sector: 'Örnek eski' } })).statusCode).toBe(409);
    const outcomes = await Promise.all([request('PATCH', `/api/brands/${brand.id}`, { version: 2, changes: { relationStatus: 'WARM' } }), request('PATCH', `/api/brands/${brand.id}`, { version: 2, changes: { relationStatus: 'ACTIVE' } })]); expect(outcomes.map(result => result.statusCode).sort()).toEqual([200, 409]);
    for (const website of ['not a url', 'http://example.com', 'https://user:pass@example.com', 'https://drive.google.com./file/private']) expect((await request('POST', '/api/brands', { name: 'Örnek geçersiz', sector: '', website, relationStatus: 'NEW' })).statusCode).toBe(400);
  });
  it('rejects foreign/deleted parents, path substitution, invalid date ranges, duplicate links and missing CSRF', async () => {
    const brand = await create(); const other = await create('Örnek Diğer Marka'); const contact = await person(); const link = await attach(brand.id, contact.id);
    expect((await request('PATCH', `/api/brands/${other.id}/contacts/${link.id}`, { version: 1, brandVersion: 1, details })).statusCode).toBe(404);
    expect((await request('POST', `/api/brands/${brand.id}/contacts`, { version: 2, personId: contact.id, details })).statusCode).toBe(409);
    expect((await request('PATCH', `/api/brands/${brand.id}/contacts/${link.id}`, { version: 1, brandVersion: 2, details: { ...details, endDate: '2025-12-31' } })).statusCode).toBe(400);
    await db.owner.create({ data: { id: 'other', email: encrypt('other@example.com', 'Owner.email') } });
    const foreign = await db.person.create({ data: { ownerId: 'other', name: 'Örnek Yabancı Kişi', searchName: 'ornek yabanci kisi' } });
    expect((await request('POST', `/api/brands/${brand.id}/contacts`, { version: 2, personId: foreign.id, details })).statusCode).toBe(404);
    await db.person.update({ where: { id: contact.id }, data: { deletedAt: new Date() } });
    expect((await request('GET', `/api/brands/${brand.id}`)).json().contactCount).toBe(0); expect((await request('GET', `/api/brands/${brand.id}/contacts`)).json().items).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/api/brands/${brand.id}`, remoteAddress: address, headers: { cookie, origin }, payload: { version: 2 } })).statusCode).toBe(403);
  });
  it('restores links with live-parent checks and a brand-version bump while preserving Person and other brands on purge', async () => {
    const a = await create('Örnek Birinci Marka'); const b = await create('Örnek İkinci Marka'); const contact = await person(); const link = await attach(a.id, contact.id); await attach(b.id, contact.id);
    expect((await request('DELETE', `/api/brands/${a.id}/contacts/${link.id}`, { version: 1, brandVersion: 2 })).statusCode).toBe(200);
    const reattach = await request('POST', `/api/brands/${a.id}/contacts`, { version: 3, personId: contact.id, details }); expect(reattach.statusCode).toBe(409); expect(reattach.json().code).toBe('BRAND_CONTACT_IN_TRASH');
    const trash = await db.trashEntry.findFirstOrThrow({ where: { entityId: link.id } });
    await db.person.update({ where: { id: contact.id }, data: { deletedAt: new Date() } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 2 })).statusCode).toBe(409);
    await db.person.update({ where: { id: contact.id }, data: { deletedAt: null } });
    expect((await request('POST', `/api/trash/${trash.id}/restore`, { version: trash.version, recordVersion: 2 })).statusCode).toBe(200); expect(await version(a.id)).toBe(4);
    await purge('Brand', a.id); expect(await db.brandContact.count({ where: { brandId: a.id } })).toBe(0); expect(await db.person.count({ where: { id: contact.id } })).toBe(1); expect((await request('GET', `/api/brands/${b.id}`)).json().contactCount).toBe(1);
    await purge('Person', contact.id); expect(await db.brand.count({ where: { id: b.id } })).toBe(1); expect(await db.brandContact.count()).toBe(0);
  });
  it('removes only example dependency links and brands, preserving real Person and independent real brands', async () => {
    const example = await create('Örnek Örnek Marka', true); const real = await create('Örnek Bağımsız Marka'); const realPerson = await person(); const examplePerson = await person(true);
    await attach(example.id, realPerson.id); await attach(real.id, examplePerson.id);
    const preview = await db.$transaction(tx => examplePreview(tx)); expect(preview.result.counts.Brand).toBe(1); expect(preview.result.counts.BrandContact).toBe(2);
    await cleanupExamples(db, preview.result.previewToken); expect(await db.brand.findUnique({ where: { id: real.id } })).not.toBeNull(); expect(await db.person.findUnique({ where: { id: realPerson.id } })).not.toBeNull(); expect(await db.brandContact.count()).toBe(0);
  });
});
