import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { db } from '../server/db.js';
import { encrypt } from '../server/crypto.js';
import { captureRecovery, compareRecovery, decryptRecovery, encryptRecovery, isLocalRecoveryServer, recoverySnapshot, restoreRecoveryRows, validateRecovery, verifyRecoveryKeys, type RecoveryBundle } from '../server/recovery.js';
import { isolateRecoveryDatabase, localRecoveryAdmin, verifyRecoveryInTemporaryDatabase } from '../server/recovery-verification.js';
import { LocalFileStorage, newStorageKey } from '../server/storage.js';

const phrase = 'Example independent archive passphrase'; let client: pg.Client; let root: string; let storage: LocalFileStorage; const keys: string[] = [];
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!); if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/metodo_test') throw new Error('Unsafe test database');
  client = new pg.Client({ connectionString: url.toString() }); await client.connect(); await mkdir('.local/tmp', { recursive: true }); root = await mkdtemp(resolve('.local/tmp/recovery-')); storage = new LocalFileStorage(root);
});
beforeEach(async () => {
  const tables = Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(','); await db.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
  await db.owner.create({ data: { email: encrypt('owner@example.com', 'Owner.email') } });
});
afterEach(async () => { for (const key of keys.splice(0)) await storage.remove(key); });
afterAll(async () => { await client.end(); await db.$disconnect(); await rmdir(root); });

async function fixture() {
  const club = await db.club.create({ data: { name: 'Örnek Kurtarma Kulübü', searchName: 'ornek kurtarma kulubu', isExample: true } });
  const player = await db.player.create({ data: { name: 'Örnek Kurtarma Oyuncusu', searchName: 'ornek kurtarma oyuncusu', primaryPosition: 'CM', status: 'OWN', isExample: true, birthDate: encrypt('2000-02-01', 'Player.birthDate') } });
  const second = await db.player.create({ data: { name: 'Örnek JSON null', searchName: 'ornek json null', primaryPosition: 'CB', isExample: true } });
  await db.player.create({ data: { name: 'Örnek SQL null', searchName: 'ornek sql null', primaryPosition: 'CF', isExample: true } });
  await client.query('UPDATE "Player" SET mandate=$1::jsonb WHERE id=$2', ['{"large":900719925474099312345,"items":[]}', player.id]);
  await client.query('UPDATE "Player" SET mandate=$1::jsonb WHERE id=$2', ['null', second.id]);
  await db.request.create({ data: { name: 'Örnek Büyük Tutar', clubId: club.id, position: 'CM', salaryMax: '1234567890123456.78', salaryCurrency: 'EUR', preferredCountries: [], preferredLeagues: [], tags: [], deadline: new Date('2028-02-29'), isExample: true } });
  const bytes = await sharp({ create: { width: 3, height: 4, channels: 3, background: '#d5bd91' } }).png().toBuffer();
  for (const deletedAt of [null, new Date()]) {
    const storageKey = newStorageKey(); keys.push(storageKey); await storage.put(storageKey, bytes);
    await db.attachment.create({ data: { name: 'Örnek portre.png', entityType: 'Player', entityId: player.id, storageKey, contentHash: createHash('sha256').update(bytes).digest('hex'), mimeType: 'image/png', sizeBytes: bytes.length, isExample: true, deletedAt } });
  }
  const resource = await db.externalResource.create({ data: { name: 'Örnek Drive kaynağı', searchName: 'ornek drive kaynagi', kind: 'DOCUMENT', externalUrl: encrypt('https://drive.google.com/file/d/ExampleRecovery/view', 'ExternalResource.externalUrl'), isExample: true } });
  await db.externalResourceLink.create({ data: { name: resource.name, resourceId: resource.id, playerId: player.id, isExample: true } });
  const person = await db.person.create({ data: { name: 'Örnek Kurtarma Kişisi', searchName: 'ornek kurtarma kisisi', role: 'OFFICIAL', isExample: true } });
  const brand = await db.brand.create({ data: { name: 'Örnek Kurtarma Markası', searchName: 'ornek kurtarma markasi', sector: 'Örnek spor', isExample: true } });
  await db.brandContact.create({ data: { name: person.name, brandId: brand.id, personId: person.id, roleTitle: 'Örnek marka görevi', startDate: new Date('2026-01-01'), isExample: true } });
  const presentation = await db.presentation.create({ data: { name: 'Örnek Kurtarma Sunumu', date: new Date('2026-01-01'), followUpDate: new Date('2026-12-01'), playerId: player.id, clubId: club.id, personId: person.id, isExample: true } });
  // The original Task was hard-purged; restoring must still preserve its consumed receipt.
  await db.taskGenerationReceipt.create({ data: { name: 'Örnek Kurtarma Makbuzu', ruleKey: 'presentation-follow-up-v1', entityType: 'Presentation', entityId: presentation.id, targetDate: presentation.followUpDate, taskId: randomUUID(), sourceVersion: 1, ruleVersion: 2, isExample: true } });
  await db.session.create({ data: { id: 'ExampleSessionHash', ownerId: 'owner', email: encrypt('owner@example.com', 'Session.email'), expiresAt: new Date(Date.now() + 60000) } });
  await db.storageDeletion.create({ data: { driver: 'local', storageKey: newStorageKey(), notBefore: new Date() } });
  return captureRecovery(client, { local: storage }, true);
}

describe('sensitive paths: encrypted pilot recovery', () => {
  it('accepts only the exact pinned private container address behind a loopback URL', () => {
    try {
      vi.stubEnv('RECOVERY_LOCAL_SERVER_ADDRESS', '172.18.0.4'); expect(isLocalRecoveryServer('172.18.0.4')).toBe(true);
      expect(isLocalRecoveryServer('172.18.0.5')).toBe(false); expect(isLocalRecoveryServer('10.0.0.4')).toBe(false);
      expect(isLocalRecoveryServer('127.0.0.1')).toBe(true); expect(isLocalRecoveryServer('::1')).toBe(true);
      vi.stubEnv('RECOVERY_LOCAL_SERVER_ADDRESS', '203.0.113.4'); expect(isLocalRecoveryServer('203.0.113.4')).toBe(false);
      expect(() => localRecoveryAdmin('postgresql://owner@172.18.0.4/private')).toThrow('LOCAL_DATABASE_REQUIRED');
    } finally { vi.unstubAllEnvs(); }
  });
  it('restores exact Decimal, JSON, dates, relationships and live/trashed file bytes into a new temporary database', async () => {
    const bundle = await fixture(); expect(bundle.tables.Session).toBeUndefined(); expect(bundle.tables.StorageDeletion).toBeUndefined(); expect(bundle.tables.OAuthAttempt).toBeUndefined();
    expect(bundle.tables.Request[0].salaryMax).toBe('1234567890123456.78'); expect(bundle.tables.Request[0].deadline).toBe('2028-02-29');
    expect(bundle.tables.Player.map(row => row.mandate)).toEqual(expect.arrayContaining([null, 'null', expect.stringContaining('900719925474099312345')]));
    expect(bundle.manifest.Attachment).toMatchObject({ count: 2, live: 1, trashed: 1, examples: 2 });
    expect(bundle.manifest.TaskGenerationReceipt).toMatchObject({ count: 1, examples: 1 }); expect(bundle.tables.Task).toHaveLength(0);
    expect(bundle.manifest.Brand).toMatchObject({ count: 1, examples: 1 }); expect(bundle.manifest.BrandContact).toMatchObject({ count: 1, examples: 1 });
    const result = await verifyRecoveryInTemporaryDatabase(bundle, process.env.DATABASE_URL!);
    expect(result).toMatchObject({ ok: true, mismatches: [], objects: 2, applicationStarted: false, objectRestore: { count: 2, target: 'isolated-memory' } });
    expect((await client.query('SELECT datname FROM pg_database WHERE datname=$1', [result.temporaryDatabase])).rows).toEqual([]);
    expect(await db.session.count()).toBe(1); expect(await db.storageDeletion.count()).toBe(1);
  }, 120000);
  it('encrypts by default and rejects a wrong password, tampering, same-count corruption and missing objects', async () => {
    const bundle = await fixture(); const wire = await encryptRecovery(bundle, phrase); expect(wire.toString()).not.toContain('Örnek'); expect(wire.toString()).not.toContain('1234567890123456.78');
    expect(await decryptRecovery(wire, phrase)).toEqual(bundle); await expect(decryptRecovery(wire, 'Example wrong independent passphrase')).rejects.toThrow('INVALID_OR_CORRUPT_BACKUP');
    const modified = JSON.parse(wire.toString()); modified.ciphertext = (modified.ciphertext[0] === 'A' ? 'B' : 'A') + modified.ciphertext.slice(1);
    await expect(decryptRecovery(Buffer.from(JSON.stringify(modified)), phrase)).rejects.toThrow('INVALID_OR_CORRUPT_BACKUP');
    const changed: RecoveryBundle = structuredClone(bundle); changed.tables.Request[0].salaryMax = '1234567890123456.79';
    expect(() => validateRecovery(changed)).toThrow('CHECKSUM_MISMATCH'); expect(compareRecovery(bundle, changed.tables)).toMatchObject({ ok: false, mismatches: ['Request'] });
    const missing = structuredClone(bundle); missing.objects.pop(); expect(() => validateRecovery(missing)).toThrow('MISSING_OR_CHANGED_OBJECT');
    const corrupt = structuredClone(bundle); corrupt.objects[0].data = Buffer.alloc(corrupt.objects[0].size).toString('base64'); expect(() => validateRecovery(corrupt)).toThrow('OBJECT_CHECKSUM_MISMATCH');
  }, 60000);
  it('requires sensitive opt-in and actual file storage, fails on missing or changed file bytes', async () => {
    await expect(captureRecovery(client, {}, false)).rejects.toThrow('EXPLICIT_SENSITIVE_OPT_IN_REQUIRED'); await fixture();
    await expect(captureRecovery(client, {}, true)).rejects.toThrow('STORAGE_UNAVAILABLE');
    await storage.remove(keys[0]); await expect(captureRecovery(client, { local: storage }, true)).rejects.toThrow();
  });
  it('rejects remote/current database targets and proves key availability rather than only ciphertext counts', async () => {
    const bundle = await fixture(); expect(() => localRecoveryAdmin('postgresql://owner@example.com/private')).toThrow('LOCAL_DATABASE_REQUIRED');
    expect(() => localRecoveryAdmin('postgresql://owner@127.0.0.1/private?host=example.com')).toThrow('LOCAL_DATABASE_REQUIRED');
    await expect(restoreRecoveryRows(client, bundle, 'metodo_test')).rejects.toThrow('TEMPORARY_DATABASE_REQUIRED');
    const before = await recoverySnapshot(client); expect(compareRecovery(bundle, before).ok).toBe(true);
    const missingKey = structuredClone(bundle); missingKey.tables.Owner[0].email = encrypt('owner@example.com', 'Owner.email', { active: 'ExampleUnavailable', keys: { ExampleUnavailable: randomBytes(32).toString('base64') }, blind: randomBytes(32).toString('base64') });
    expect(() => verifyRecoveryKeys(missingKey)).toThrow('FIELD_KEY_RING_REQUIRED');
  });
  it('rolls back missing-parent restores and removes only its own temporary database', async () => {
    await fixture(); await db.owner.create({ data: { id: 'ExampleOtherOwner', email: encrypt('other@example.com', 'Owner.email') } });
    const otherClub = await db.club.create({ data: { ownerId: 'ExampleOtherOwner', name: 'Örnek Diğer Kulüp', searchName: 'ornek diger kulup', isExample: true } });
    await db.request.updateMany({ data: { clubId: otherClub.id } }); const bundle = await captureRecovery(client, { local: storage }, true);
    expect(bundle.tables.Club.every(row => row.id !== otherClub.id)).toBe(true);
    const before = (await client.query("SELECT datname FROM pg_database WHERE datname LIKE 'metodo_recovery_%' ORDER BY datname")).rows;
    await expect(verifyRecoveryInTemporaryDatabase(bundle, process.env.DATABASE_URL!)).rejects.toThrow();
    expect((await client.query("SELECT datname FROM pg_database WHERE datname LIKE 'metodo_recovery_%' ORDER BY datname")).rows).toEqual(before);
    expect((await db.request.findFirstOrThrow()).clubId).toBe(otherClub.id);
  }, 120000);
  it('runs the actual encrypted create/verify commands with a separate passphrase file and value-free audit', async () => {
    await fixture(); await mkdir('.local/backups', { recursive: true }); const file = resolve('.local/backups', 'example-' + randomUUID() + '.mcrm'); const passFile = resolve(root, 'example-passphrase.txt');
    await writeFile(passFile, phrase, { flag: 'wx', mode: 0o600 });
    const env = { ...process.env, RECOVERY_SOURCE_DATABASE_URL: process.env.DATABASE_URL, RECOVERY_LOCAL_DATABASE_URL: process.env.DATABASE_URL, STORAGE_DRIVER: 'local', STORAGE_PATH: root };
    const run = (action: string, extra: string[] = []) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/recovery.ts', action, '--file', file, '--passphrase-file', passFile, ...extra], { env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    const reports: string[] = [];
    const verified = () => { const result = run('verify'); const report = JSON.parse(result.stdout); expect(report.reportFile).toMatch(/^reports\/verification-[a-f0-9-]+\.json$/); reports.push(resolve('.local/backups', report.reportFile)); return { result, report }; };
    try {
      const creation = run('create', ['--include-sensitive']); expect(creation.status, creation.stderr).toBe(0); expect(JSON.parse(creation.stdout)).toMatchObject({ encrypted: true, objects: 2 });
      expect((await db.auditLog.findFirstOrThrow({ where: { entityType: 'RecoveryBackup' } })).diffs).toMatchObject({ includeSensitive: true, objects: 2 });
      const first = verified(); expect(first.result.status, first.result.stderr).toBe(0); expect(first.report).toMatchObject({ ok: true, objects: 2, applicationStarted: false });
      const second = verified(); expect(second.result.status, second.result.stderr).toBe(0); expect(second.report.reportFile).not.toBe(first.report.reportFile);
      await writeFile(passFile, 'Example wrong independent passphrase'); const failed = verified(); expect(failed.result.status).toBe(1); expect(failed.report.ok).toBe(false);
      expect(new Set(reports).size).toBe(3); expect(JSON.parse(await readFile(reports[0], 'utf8')).ok).toBe(true); expect(JSON.parse(await readFile(reports[2], 'utf8')).ok).toBe(false);
      expect((await readFile(file, 'utf8'))).not.toContain('owner@example.com');
    } finally { for (const path of [...reports, file, passFile]) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }, 180000);
  it('denies a separate local login role before any recovered data is loaded', async () => {
    const adminUrl = localRecoveryAdmin(process.env.DATABASE_URL!); const admin = new pg.Client({ connectionString: adminUrl.toString() }); await admin.connect();
    const suffix = randomBytes(12).toString('hex'); const name = 'metodo_recovery_' + suffix; const role = 'metodo_recovery_probe_' + suffix; const password = randomBytes(32).toString('hex');
    let createdRole = false; let createdDatabase = false; let probe: pg.Client | undefined;
    try {
      const statement = (await admin.query<{ sql: string }>("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text,$2::text) AS sql", [role, password])).rows[0].sql;
      await admin.query(statement); createdRole = true; await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`); createdDatabase = true;
      await isolateRecoveryDatabase(admin, name); const probeUrl = new URL(adminUrl); probeUrl.pathname = '/' + name; probeUrl.username = role; probeUrl.password = password;
      probe = new pg.Client({ connectionString: probeUrl.toString() }); await expect(probe.connect()).rejects.toMatchObject({ code: '42501' });
    } finally {
      await probe?.end(); if (createdDatabase) await admin.query(`DROP DATABASE "${name}"`); if (createdRole) await admin.query(`DROP ROLE "${role}"`); await admin.end();
    }
  });
});
