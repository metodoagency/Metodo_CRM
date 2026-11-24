import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { Prisma } from '@prisma/client';
import type { Client } from 'pg';
import { z } from 'zod';
import { checkStorageKey, type FileStorage } from './storage.js';
import { blindIndex, decrypt, encryptedFields } from './crypto.js';

export class RecoveryError extends Error {}
function fail(code: string): never { throw new RecoveryError(code); }
export const recoveryLimit = 64 * 1024 * 1024;
export function isLocalRecoveryServer(host: string) {
  const pinned = process.env.RECOVERY_LOCAL_SERVER_ADDRESS;
  const parts = pinned?.split('.').map(Number);
  const privateV4 = parts && (parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168);
  return ['127.0.0.1', '::1'].includes(host) || !!pinned && isIP(pinned) === 4 && !!privateV4 && host === pinned;
}
export const recoveryExclusions = ['Session', 'OAuthAttempt', 'StorageDeletion'] as const;
export const recoveryModels = Prisma.dmmf.datamodel.models.filter(model => !recoveryExclusions.some(name => name === model.name));
const scalarFields = (model: typeof recoveryModels[number]) => model.fields.filter(field => field.kind !== 'object');
export const sqlName = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const ordered = (value: unknown): unknown => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => lexical(a, b)).map(([key, item]) => [key, ordered(item)]))
  : Array.isArray(value) ? value.map(item => ordered(item) ?? null) : value;
const canonical = (value: unknown): string => JSON.stringify(ordered(value) ?? null);
const schemaHash = hash(canonical({ models: recoveryModels.map(model => ({ name: model.name, fields: scalarFields(model).map(field => ({ name: field.name, type: field.type, list: field.isList, required: field.isRequired })) })), enums: Prisma.dmmf.datamodel.enums }));
type Row = Record<string, string | number | boolean | null>;
export type RecoverySnapshot = Record<string, Row[]>;
const sum = (rows: Row[]) => hash(canonical([...rows].sort((a, b) => lexical(String(a.id), String(b.id)))));
const checksums = (tables: RecoverySnapshot) => Object.fromEntries(Object.entries(tables).sort(([a], [b]) => lexical(a, b)).map(([name, rows]) => [name, { count: rows.length, live: rows.filter(row => row.deletedAt == null).length, trashed: rows.filter(row => row.deletedAt != null).length, examples: rows.filter(row => row.isExample === true).length, checksum: sum(rows) }]));
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const objectSchema = z.object({ driver: z.enum(['local', 's3']), key: sha, size: z.number().int().nonnegative().max(10 * 1024 * 1024), checksum: sha, mime: z.string().max(255), data: z.string().max(recoveryLimit * 2) }).strict();
const bundleSchema = z.object({ format: z.literal('METODO_RECOVERY_1'), createdAt: z.iso.datetime(), schemaHash: sha,
  postgresVersion: z.string().max(100), migrations: z.array(z.object({ name: z.string().regex(/^\d{12,14}_[a-z0-9_]+$/), checksum: sha, storedChecksum: sha }).strict()), fieldKeyIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)),
  excluded: z.array(z.string()), tables: z.record(z.string(), z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))),
  manifest: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), live: z.number().int().nonnegative(), trashed: z.number().int().nonnegative(), examples: z.number().int().nonnegative(), checksum: sha }).strict()), objects: z.array(objectSchema).max(10000),
}).strict();
export type RecoveryBundle = z.infer<typeof bundleSchema>;

export function verifyRecoveryKeys(bundle: Pick<RecoveryBundle, 'tables'>) {
  const ids = new Set<string>();
  try {
    for (const [model, fields] of Object.entries(encryptedFields)) for (const row of bundle.tables[model] ?? []) for (const field of fields) {
      const value = row[field]; if (value === null) continue; if (typeof value !== 'string') fail('INVALID_ENCRYPTED_FIELD');
      const plain = decrypt(value, `${model}.${field}`); ids.add(value.split('.')[1]);
      if ((model === 'Person' || model === 'Player') && (field === 'phone' || field === 'email') && row[field + 'Index'] != null && blindIndex(plain) !== row[field + 'Index']) fail('BLIND_KEY_MISMATCH');
    }
  } catch { return fail('FIELD_KEY_RING_REQUIRED'); }
  return [...ids].sort();
}
async function databaseMetadata(client: Client) {
  const columns = (await client.query<{ table: string; column: string }>(`SELECT c.relname AS "table", a.attname AS "column" FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations'`)).rows;
  const actual = columns.map(row => `${row.table}.${row.column}`).sort();
  const expected = Prisma.dmmf.datamodel.models.flatMap(model => scalarFields(model).map(field => `${model.dbName ?? model.name}.${field.dbName ?? field.name}`)).sort();
  if (canonical(actual) !== canonical(expected)) fail('DATABASE_SCHEMA_MISMATCH');
  const records = (await client.query<{ name: string; checksum: string }>('SELECT migration_name AS name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')).rows;
  const migrations = [];
  for (const record of records) {
    if (!/^\d{12,14}_[a-z0-9_]+$/.test(record.name)) fail('MIGRATION_MISMATCH');
    const source = await readFile(resolve('prisma/migrations', record.name, 'migration.sql'), 'utf8'); const lf = source.replaceAll('\r\n', '\n');
    // Prisma accepts the two platform line endings. Preserve the original DB
    // checksum and compare only after proving either exact LF or exact CRLF.
    if (![hash(source), hash(lf), hash(lf.replaceAll('\n', '\r\n'))].includes(record.checksum)) fail('MIGRATION_MISMATCH');
    migrations.push({ name: record.name, checksum: hash(lf), storedChecksum: record.checksum });
  }
  return { postgresVersion: (await client.query<{ server_version: string }>('SHOW server_version')).rows[0].server_version, migrations };
}

// Explicit casts preserve Decimal/BigInt precision, DATE/TIMESTAMP and arrays.
// JSON is text too: SQL NULL and the JSON literal null remain distinguishable.
export async function recoverySnapshot(client: Client): Promise<RecoverySnapshot> {
  const result: RecoverySnapshot = {};
  await client.query("SET DateStyle = 'ISO, YMD'; SET TIME ZONE 'UTC'; SET bytea_output = 'hex'");
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    for (const model of recoveryModels) {
      const columns = scalarFields(model).map(field => {
        const name = sqlName(field.dbName ?? field.name);
        return `${name}${field.isList || !['Int', 'Float', 'Boolean'].includes(field.type) ? '::text' : ''} AS ${sqlName(field.name)}`;
      }).join(',');
      const owner = model.name === 'Owner' ? 'id' : 'ownerId';
      if (!model.fields.some(field => field.name === owner)) fail('UNSCOPED_MODEL');
      result[model.name] = (await client.query<Row>(`SELECT ${columns} FROM ${sqlName(model.dbName ?? model.name)} WHERE ${sqlName(owner)} = $1 ORDER BY "id"`, ['owner'])).rows;
    }
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
function objectId(item: { driver: string; key: string }) { return `${item.driver}:${item.key}`; }
export function validateRecovery(input: unknown): RecoveryBundle {
  const parsed = bundleSchema.safeParse(input); if (!parsed.success) fail('INVALID_BACKUP'); const bundle = parsed.data;
  if (bundle.schemaHash !== schemaHash || canonical(bundle.excluded) !== canonical(recoveryExclusions)) fail('SCHEMA_MISMATCH');
  if (canonical(Object.keys(bundle.tables).sort()) !== canonical(recoveryModels.map(model => model.name).sort())) fail('TABLE_MISMATCH');
  for (const model of recoveryModels) {
    const fields = scalarFields(model).map(field => field.name).sort(); const seen = new Set<string>();
    for (const row of bundle.tables[model.name]) {
      if (canonical(Object.keys(row).sort()) !== canonical(fields) || typeof row.id !== 'string' || seen.has(row.id) || (model.name === 'Owner' ? row.id : row.ownerId) !== 'owner') fail('INVALID_ROW');
      seen.add(row.id);
    }
  }
  if (canonical(checksums(bundle.tables)) !== canonical(bundle.manifest)) fail('CHECKSUM_MISMATCH');
  const files = new Map<string, z.infer<typeof objectSchema>>();
  for (const object of bundle.objects) {
    const data = Buffer.from(object.data, 'base64');
    if (object.data !== data.toString('base64') || data.length !== object.size || hash(data) !== object.checksum || files.has(objectId(object))) fail('OBJECT_CHECKSUM_MISMATCH');
    files.set(objectId(object), object);
  }
  const referenced = new Set<string>();
  for (const row of bundle.tables.Attachment) {
    const file = files.get(`${row.storageDriver}:${row.storageKey}`);
    if (!file || file.size !== row.sizeBytes || file.mime !== row.mimeType || row.contentHash && row.contentHash !== file.checksum) fail('MISSING_OR_CHANGED_OBJECT');
    referenced.add(objectId(file));
  }
  if (referenced.size !== files.size) fail('UNREFERENCED_OBJECT');
  return bundle;
}
export async function captureRecovery(client: Client, storage: Partial<Record<FileStorage['driver'], FileStorage>>, includeSensitive: boolean): Promise<RecoveryBundle> {
  if (!includeSensitive) fail('EXPLICIT_SENSITIVE_OPT_IN_REQUIRED');
  const metadata = await databaseMetadata(client); const tables = await recoverySnapshot(client); const objects: RecoveryBundle['objects'] = []; const seen = new Set<string>(); let size = Buffer.byteLength(JSON.stringify(tables));
  if (size > recoveryLimit) fail('PILOT_BACKUP_SIZE_LIMIT');
  for (const model of recoveryModels) if (model.name !== 'Attachment' && model.fields.some(field => field.name === 'storageKey') && tables[model.name].length) fail('UNSUPPORTED_FILE_MODEL');
  for (const row of tables.Attachment) {
    const key = checkStorageKey(String(row.storageKey)); const driver = row.storageDriver;
    if (driver !== 'local' && driver !== 's3') fail('UNKNOWN_STORAGE_DRIVER');
    if (seen.has(`${driver}:${key}`)) continue; const adapter = storage[driver]; if (!adapter || adapter.driver !== driver) fail('STORAGE_UNAVAILABLE');
    const bytes = await adapter.read(key); if (bytes.length > 10 * 1024 * 1024) fail('FILE_SIZE_LIMIT'); size += Math.ceil(bytes.length / 3) * 4;
    if (size > recoveryLimit) fail('PILOT_BACKUP_SIZE_LIMIT');
    objects.push({ driver, key, size: bytes.length, checksum: hash(bytes), mime: String(row.mimeType), data: bytes.toString('base64') }); seen.add(`${driver}:${key}`);
  }
  const bundle = validateRecovery({ format: 'METODO_RECOVERY_1', createdAt: new Date().toISOString(), schemaHash, ...metadata, fieldKeyIds: verifyRecoveryKeys({ tables }), excluded: [...recoveryExclusions], tables, manifest: checksums(tables), objects });
  if (canonical(await databaseMetadata(client)) !== canonical(metadata)) fail('SNAPSHOT_CHANGED');
  if (canonical(checksums(await recoverySnapshot(client))) !== canonical(bundle.manifest)) fail('SNAPSHOT_CHANGED');
  return bundle;
}

const wireSchema = z.object({ format: z.literal('METODO_ENCRYPTED_1'), kdf: z.literal('scrypt-131072-8-1'), salt: z.string().max(24), iv: z.string().max(16), tag: z.string().max(24), ciphertext: z.string().max(recoveryLimit * 2) }).strict();
const derive = (passphrase: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => scrypt(passphrase, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
const pass = (value: string) => { if (value.length < 20 || value.length > 1024) fail('PASSPHRASE_LENGTH'); };
export async function encryptRecovery(bundle: RecoveryBundle, passphrase: string): Promise<Buffer> {
  pass(passphrase); validateRecovery(bundle); const plaintext = Buffer.from(JSON.stringify(bundle)); if (plaintext.length > recoveryLimit) fail('PILOT_BACKUP_SIZE_LIMIT');
  const salt = randomBytes(16); const iv = randomBytes(12); const key = await derive(passphrase, salt);
  try { const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from('METODO_ENCRYPTED_1'));
    const ciphertext = Buffer.concat([cipher.update(gzipSync(plaintext)), cipher.final()]);
    return Buffer.from(JSON.stringify({ format: 'METODO_ENCRYPTED_1', kdf: 'scrypt-131072-8-1', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
  } finally { key.fill(0); plaintext.fill(0); }
}
export async function decryptRecovery(bytes: Buffer, passphrase: string): Promise<RecoveryBundle> {
  pass(passphrase); if (bytes.length > recoveryLimit * 2) fail('PILOT_BACKUP_SIZE_LIMIT');
  let wire: z.infer<typeof wireSchema>;
  try { wire = wireSchema.parse(JSON.parse(bytes.toString('utf8'))); } catch { return fail('INVALID_BACKUP'); }
  const salt = Buffer.from(wire.salt, 'base64'); const iv = Buffer.from(wire.iv, 'base64'); const tag = Buffer.from(wire.tag, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) fail('INVALID_BACKUP'); const key = await derive(passphrase, salt);
  try { const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from('METODO_ENCRYPTED_1')); cipher.setAuthTag(tag);
    const compressed = Buffer.concat([cipher.update(Buffer.from(wire.ciphertext, 'base64')), cipher.final()]);
    return validateRecovery(JSON.parse(gunzipSync(compressed, { maxOutputLength: recoveryLimit }).toString('utf8')));
  } catch { return fail('INVALID_OR_CORRUPT_BACKUP'); } finally { key.fill(0); }
}

export function compareRecovery(bundle: RecoveryBundle, tables: RecoverySnapshot) {
  const actual = checksums(tables); const names = new Set([...Object.keys(bundle.manifest), ...Object.keys(actual)]);
  const mismatches = [...names].filter(name => !actual[name] || !bundle.manifest[name] || canonical(actual[name]) !== canonical(bundle.manifest[name]));
  return { ok: mismatches.length === 0, mismatches, tables: Object.keys(bundle.manifest).length, rows: Object.values(bundle.manifest).reduce((total, entry) => total + entry.count, 0), objects: bundle.objects.length };
}
// Only the temporary-restore helper receives this primitive. Never expose it
// as a runtime restore endpoint or run it against an owner's live database.
export async function restoreRecoveryRows(client: Client, bundle: RecoveryBundle, databaseName: string) {
  const target = (await client.query<{ name: string; host: string | null }>('SELECT current_database() AS name, host(inet_server_addr()) AS host')).rows[0];
  if (!/^metodo_recovery_[a-f0-9]{24}$/.test(databaseName) || target.name !== databaseName || !isLocalRecoveryServer(target.host ?? '')) fail('TEMPORARY_DATABASE_REQUIRED');
  validateRecovery(bundle);
  const metadata = await databaseMetadata(client); const comparable = (items: RecoveryBundle['migrations']) => items.map(({ name, checksum }) => ({ name, checksum }));
  if (canonical(comparable(metadata.migrations)) !== canonical(comparable(bundle.migrations))) fail('MIGRATION_MISMATCH');
  if (canonical(verifyRecoveryKeys(bundle)) !== canonical(bundle.fieldKeyIds)) fail('FIELD_KEY_RING_REQUIRED');
  for (const model of recoveryModels) if (Number((await client.query(`SELECT count(*) FROM ${sqlName(model.dbName ?? model.name)}`)).rows[0].count) !== 0) fail('EMPTY_DATABASE_REQUIRED');
  const constraints = (await client.query<{ table: string; name: string }>(`SELECT t.relname AS "table", c.conname AS name FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname='public'`)).rows;
  await client.query('BEGIN');
  try {
    for (const constraint of constraints) await client.query(`ALTER TABLE ${sqlName(constraint.table)} ALTER CONSTRAINT ${sqlName(constraint.name)} DEFERRABLE INITIALLY DEFERRED`);
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    for (const model of recoveryModels) {
      const fields = scalarFields(model);
      for (const row of bundle.tables[model.name]) await client.query(`INSERT INTO ${sqlName(model.dbName ?? model.name)} (${fields.map(field => sqlName(field.dbName ?? field.name)).join(',')}) VALUES (${fields.map((_, index) => '$' + (index + 1)).join(',')})`, fields.map(field => row[field.name]));
    }
    await client.query('SET CONSTRAINTS ALL IMMEDIATE'); await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  return compareRecovery(bundle, await recoverySnapshot(client));
}
