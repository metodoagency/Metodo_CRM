import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { db } from '../server/db.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { decrypt, encrypt, encryptedFields } from '../server/crypto.js';
import { contractDocumentLink, contractSourceEvidence, protectLegacyContractLinks } from '../server/contract-evidence.js';
import type { ContractInput } from '../shared/player-contracts.js';
import type { Tx } from '../server/core.js';
import { maskSensitive } from '../shared/domain.js';

const origin = 'http://localhost:5173'; let app: FastifyInstance; let cookie = ''; let csrf = ''; let seq = 0; let address = '';
const source = 'https://drive.google.com/file/d/ExampleContractSource/view?resourcekey=ExamplePrivateKey';
const document = 'https://example.com/private-contract.pdf?key=ExampleDocumentKey';
function request(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown) { return app.inject({ method, url: path, remoteAddress: address,
  headers: { cookie, origin, 'x-csrf-token': csrf }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }); }
const draft = (sourceUrl = source): ContractInput => ({ name: 'Örnek Kaynak Sözleşmesi', type: 'EMPLOYMENT', clubId: null, agentId: null,
  signedDate: null, startDate: '2026-01-01', endDate: '2028-06-30', isActive: true, salaryAmount: null, salaryCurrency: null,
  salaryPeriod: null, salaryBasis: null, bonuses: null, paymentDay: null, releaseClause: null, buyout: null, extensionOption: null,
  noticeDeadline: null, representation: null, documentLink: document, sourceUrl, sourceDate: '2026-01-01', methodNote: 'Örnek elle kayıt' });
async function fixture(sourceUrl = source) {
  const player = await db.player.create({ data: { name: 'Örnek Kaynak Oyuncusu', searchName: 'ornek kaynak oyuncusu', primaryPosition: 'CM', status: 'OWN', isExample: true } });
  const response = await request('POST', `/api/players/${player.id}/contracts`, draft(sourceUrl)); expect(response.statusCode, response.body).toBe(201);
  return { player, record: response.json<{ id: string; version: number }>() };
}
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: origin, ALLOWED_EMAILS: 'owner@example.com', FILE_STORAGE_MODE: 'drive' }) }); });
beforeEach(async () => {
  if (!process.env.DATABASE_URL?.includes('/metodo_test')) throw new Error('Unsafe test database');
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(','); await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  address = `127.11.0.${++seq}`; const login = await app.inject({ method: 'POST', url: '/auth/test', remoteAddress: address, headers: { origin }, payload: { email: 'owner@example.com' } });
  expect(login.statusCode).toBe(200); cookie = String(login.headers['set-cookie']).split(';')[0]; csrf = (await request('GET', '/api/me')).json().csrfToken;
});
afterAll(async () => { vi.restoreAllMocks(); await app.close(); await db.$disconnect(); });

describe('sensitive paths: private contract document and source evidence', () => {
  it('encrypts links and private provenance, masks ordinary responses and preserves sparse edits', async () => {
    const { player, record } = await fixture(); const path = `/api/contracts/${record.id}`;
    const before = await db.contract.findUniqueOrThrow({ where: { id: record.id } });
    expect(before.documentLink).toBeNull(); expect(before.sourceUrl).toBeNull(); expect(before.fieldProvenance).toEqual({});
    expect(contractDocumentLink(before)).toBe(document); expect(contractSourceEvidence(before)).toMatchObject({ sourceUrl: source, fieldProvenance: { name: { sourceUrl: source, verificationStatus: 'UNVERIFIED' } } });
    expect(encryptedFields.Contract).toEqual(expect.arrayContaining(['privateDocumentLink', 'privateSourceEvidence']));
    const ordinary = await request('GET', path); expect(ordinary.json()).toMatchObject({ documentLink: null, sourceUrl: null, hasDocumentLink: true, hasPrivateSource: true });
    for (const url of [path, '/api/contracts', `/api/records/Player/${player.id}/timeline`, '/api/admin/access-log']) {
      const response = await request('GET', url); expect(response.statusCode).toBe(200);
      for (const secret of [source, document, before.privateDocumentLink!, before.privateSourceEvidence!]) expect(response.body).not.toContain(secret);
    }
    expect((await request('PATCH', path, { version: 1, changes: { name: 'Örnek Yeni Sözleşme' } })).statusCode).toBe(200);
    const after = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(after.privateDocumentLink).toBe(before.privateDocumentLink);
    expect(contractSourceEvidence(after).sourceUrl).toBe(source);
    const revealed = await request('POST', `${path}/reveal`, { version: 2, field: 'sourceUrl' });
    expect(revealed.json()).toMatchObject({ value: source, expiresIn: 60 }); expect(Date.parse(revealed.json().expiresAt)).toBeGreaterThan(Date.now());
    const log = await request('GET', '/api/admin/access-log'); expect(log.json().items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: record.id, field: 'sourceUrl' })])); expect(log.body).not.toContain(source);
    expect((await request('PATCH', path, { version: 2, changes: { sourceUrl: 'https://example.com/public-source', documentLink: null } })).statusCode).toBe(200);
    const replaced = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(replaced.privateDocumentLink).toBeNull();
    expect(replaced.sourceUrl).toBe('https://example.com/public-source'); expect(contractSourceEvidence(replaced).sourceUrl).toBeNull();
    expect(contractSourceEvidence(replaced).fieldProvenance.name).toMatchObject({ sourceUrl: source });
    const nextSource = 'https://docs.google.com/document/d/ExampleNewPrivateSource/edit';
    expect((await request('PATCH', path, { version: 3, changes: { sourceUrl: nextSource } })).statusCode).toBe(200);
    const final = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(final.sourceUrl).toBeNull();
    expect(contractSourceEvidence(final)).toMatchObject({ sourceUrl: nextSource, fieldProvenance: { name: { sourceUrl: source }, sourceUrl: { sourceUrl: nextSource } } });
  });
  it('preserves public provenance exactly during legacy migration and protects deleted rows idempotently', async () => {
    const { record } = await fixture('https://example.com/public-source'); const original = await db.contract.findUniqueOrThrow({ where: { id: record.id } });
    await db.contract.update({ where: { id: record.id }, data: { documentLink: document, privateDocumentLink: null, deletedAt: new Date() } });
    expect(await protectLegacyContractLinks(db)).toMatchObject({ contracts: 1 });
    const after = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(after.documentLink).toBeNull(); expect(after.deletedAt).not.toBeNull();
    expect(contractDocumentLink(after)).toBe(document); expect(after.fieldProvenance).toEqual(original.fieldProvenance); expect(after.sourceUrl).toBe(original.sourceUrl);
    expect(await protectLegacyContractLinks(db)).toEqual({ contracts: 0, timeline: 0, audit: 0 });
    expect((await db.contract.findUniqueOrThrow({ where: { id: record.id } })).version).toBe(after.version);
  });
  it('moves legacy private source entries and historical diffs into encrypted evidence without losing public metadata', async () => {
    const { player, record } = await fixture('https://example.com/public-source');
    const publicEntry = { sourceUrl: 'https://example.com/public-source', sourceType: 'OFFICIAL', retrievedAt: '2026-01-01T00:00:00.000Z', verificationStatus: 'VERIFIED' };
    const privateEntry = { ...publicEntry, sourceUrl: source, sourceType: 'DOCUMENT' };
    await db.contract.update({ where: { id: record.id }, data: { sourceUrl: source, fieldProvenance: { name: publicEntry, endDate: privateEntry }, privateSourceEvidence: null } });
    const diffs = { old: { sourceUrl: source, documentLink: document }, new: { name: 'Örnek değişiklik' } };
    const timeline = await db.timelineEvent.create({ data: { entityType: 'Player', entityId: player.id, actor: 'owner', action: 'update', batchId: record.id, summaryTr: 'Örnek', summaryEn: 'Example', diffs, isExample: true } });
    const audit = await db.auditLog.create({ data: { entityType: 'Contract', entityId: record.id, actor: 'owner', action: 'update', diffs, isExample: true } });
    expect((await request('GET', `/api/records/Player/${player.id}/timeline`)).body).not.toContain(source);
    expect(await protectLegacyContractLinks(db)).toEqual({ contracts: 1, timeline: 1, audit: 1 });
    const after = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(after.fieldProvenance).toEqual({ name: publicEntry });
    expect(contractSourceEvidence(after)).toMatchObject({ sourceUrl: source, fieldProvenance: { endDate: privateEntry } });
    for (const [row, model] of [[await db.timelineEvent.findUniqueOrThrow({ where: { id: timeline.id } }), 'TimelineEvent'], [await db.auditLog.findUniqueOrThrow({ where: { id: audit.id } }), 'AuditLog']] as const) {
      expect(row.diffs).toMatchObject({ old: { sourceUrl: '***', documentLink: '***' } }); expect(JSON.parse(decrypt(row.privateSourceEvidence!, `${model}.privateSourceEvidence`))).toEqual(diffs);
    }
    expect(await protectLegacyContractLinks(db)).toEqual({ contracts: 0, timeline: 0, audit: 0 });
  });
  it('requires current owner version, CSRF and a live player for every disclosure', async () => {
    const { player, record } = await fixture(); const url = `/api/contracts/${record.id}/reveal`; const payload = { version: 1, field: 'documentLink' };
    expect((await app.inject({ method: 'POST', url, headers: { origin }, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url, headers: { cookie, origin }, payload })).statusCode).toBe(403);
    expect((await request('POST', url, { ...payload, version: 2 })).statusCode).toBe(409);
    expect((await request('POST', url, payload)).json().value).toBe(document);
    await db.player.update({ where: { id: player.id }, data: { deletedAt: new Date() } }); expect((await request('POST', url, payload)).statusCode).toBe(404);
  });
  it('fails closed for corrupt ciphertext and rolls back conversion when its audit write fails', async () => {
    const { record } = await fixture(); const before = await db.contract.update({ where: { id: record.id }, data: { documentLink: document, privateDocumentLink: 'v1.corrupt' } });
    expect(() => contractDocumentLink(before)).toThrow(); await expect(protectLegacyContractLinks(db)).rejects.toThrow();
    expect((await db.contract.findUniqueOrThrow({ where: { id: record.id } })).documentLink).toBe(document);
    await db.contract.update({ where: { id: record.id }, data: { privateDocumentLink: null } });
    const originalTransaction = db.$transaction.bind(db);
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((callback: (tx: Tx) => Promise<unknown>) => originalTransaction(async tx => callback(new Proxy(tx, {
      get(target, key) { if (key === 'auditLog') return new Proxy(target.auditLog, { get(delegate, name) { return name === 'create' ? async () => { throw new Error('simulated audit failure'); } : Reflect.get(delegate, name); } }); return Reflect.get(target, key); },
    })))) as typeof db.$transaction);
    try { await expect(protectLegacyContractLinks(db)).rejects.toThrow('simulated audit failure'); } finally { spy.mockRestore(); }
    const after = await db.contract.findUniqueOrThrow({ where: { id: record.id } }); expect(after.documentLink).toBe(document); expect(after.privateDocumentLink).toBeNull(); expect(after.version).toBe(before.version);
    expect(encrypt(document, 'Contract.privateDocumentLink')).not.toContain(document);
  });
  it('rejects conflicting dual sources and empty ciphertext without discarding either source', async () => {
    const { record } = await fixture(); const before = await db.contract.findUniqueOrThrow({ where: { id: record.id } });
    expect(() => contractDocumentLink({ ...before, privateDocumentLink: '', documentLink: document })).toThrow();
    expect(() => contractSourceEvidence({ privateSourceEvidence: '' })).toThrow();
    await db.contract.update({ where: { id: record.id }, data: { sourceUrl: 'https://example.com/different-public-source' } });
    await expect(protectLegacyContractLinks(db)).rejects.toThrow('CONTRACT_LINK_CONFLICT');
    expect((await db.contract.findUniqueOrThrow({ where: { id: record.id } })).sourceUrl).toBe('https://example.com/different-public-source');
    await db.contract.update({ where: { id: record.id }, data: { sourceUrl: null, fieldProvenance: { name: { sourceUrl: 'https://example.com/different-public-source' } } } });
    await expect(protectLegacyContractLinks(db)).rejects.toThrow('CONTRACT_LINK_CONFLICT');
    expect(maskSensitive({ urls: [source, { nested: [source] }, 'https://example.com/public-source'] })).toEqual({ urls: ['***', { nested: ['***'] }, 'https://example.com/public-source'] });
  });
  it('rejects a stale maintenance snapshot without an evidence or audit write', async () => {
    const { record } = await fixture('https://example.com/public-source');
    const old = await db.contract.update({ where: { id: record.id }, data: { documentLink: document, privateDocumentLink: null } });
    const current = await db.contract.update({ where: { id: record.id }, data: { version: { increment: 1 } } });
    const beforeLogs = await db.auditLog.count(); const spy = vi.spyOn(db.contract, 'findMany').mockResolvedValueOnce([old]);
    try { await expect(protectLegacyContractLinks(db)).rejects.toThrow('STALE_VERSION'); } finally { spy.mockRestore(); }
    const after = await db.contract.findUniqueOrThrow({ where: { id: record.id } });
    expect(after).toEqual(current); expect(await db.auditLog.count()).toBe(beforeLogs);
  });
});
