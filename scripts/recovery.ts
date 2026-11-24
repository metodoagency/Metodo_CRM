import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { captureRecovery, decryptRecovery, encryptRecovery, RecoveryError, recoveryLimit } from '../server/recovery.js';
import { verifyRecoveryInTemporaryDatabase } from '../server/recovery-verification.js';
import { keyring } from '../server/crypto.js';
import { LocalFileStorage, S3FileStorage, type FileStorage } from '../server/storage.js';
import { tr, en } from '../shared/locales.js';

async function main() {
  const [action, ...args] = process.argv.slice(2); if (action !== 'create' && action !== 'verify') throw new RecoveryError('INVALID_ACTION');
  const options: Record<string, string> = {}; let includeSensitive = false;
  for (let index = 0; index < args.length; index++) {
    const name = args[index]; if (name === '--include-sensitive') { includeSensitive = true; continue; }
    if (!['--file', '--passphrase-file'].includes(name) || !args[index + 1] || options[name]) throw new RecoveryError('INVALID_ARGUMENT'); options[name] = args[++index];
  }
  if (!options['--file'] || !options['--passphrase-file'] || action === 'create' && !includeSensitive) throw new RecoveryError('EXPLICIT_BACKUP_ARGUMENTS_REQUIRED');
  const root = resolve('.local/backups'); const output = resolve(options['--file']); const passPath = resolve(options['--passphrase-file']);
  if (!output.startsWith(root + sep) || passPath === root || passPath.startsWith(root + sep)) throw new RecoveryError('SEPARATE_PRIVATE_PATHS_REQUIRED');
  const passInfo = await stat(passPath); if (!passInfo.isFile() || passInfo.size > 4096) throw new RecoveryError('INVALID_PASSPHRASE_FILE');
  const passphrase = (await readFile(passPath, 'utf8')).replace(/\r?\n$/, ''); const ring = keyring();
  if ([ring.blind, ...Object.values(ring.keys)].includes(passphrase)) throw new RecoveryError('INDEPENDENT_PASSPHRASE_REQUIRED');
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (action === 'verify') {
    const startedAt = new Date().toISOString(); const reportName = 'reports/verification-' + randomUUID() + '.json'; let report: Record<string, unknown>;
    try {
      if ((await stat(output)).size > recoveryLimit * 2) throw new RecoveryError('PILOT_BACKUP_SIZE_LIMIT');
      const wire = await readFile(output); const bundle = await decryptRecovery(wire, passphrase);
      const result = await verifyRecoveryInTemporaryDatabase(bundle, process.env.RECOVERY_LOCAL_DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/postgres');
      report = { startedAt, archiveHash: createHash('sha256').update(wire).digest('hex'), ...result };
    } catch (error) {
      report = { startedAt, verifiedAt: new Date().toISOString(), ok: false, code: error instanceof RecoveryError ? error.message : 'VERIFICATION_FAILED' };
    }
    await mkdir(resolve(root, 'reports'), { recursive: true, mode: 0o700 });
    await writeFile(resolve(root, reportName), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ...report, reportFile: reportName })); if (report.ok !== true) process.exitCode = 1;
    return;
  }
  const sourceUrl = process.env.RECOVERY_SOURCE_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!sourceUrl) throw new RecoveryError('SOURCE_DATABASE_REQUIRED');
  const source = new pg.Client({ connectionString: sourceUrl }); await source.connect();
  try {
    const storage: Partial<Record<FileStorage['driver'], FileStorage>> = {};
    if (process.env.NODE_ENV !== 'production') storage.local = new LocalFileStorage(process.env.STORAGE_PATH || '.local/uploads');
    if (process.env.STORAGE_DRIVER === 's3') {
      const config = z.object({ S3_ENDPOINT: z.url().refine(value => new URL(value).protocol === 'https:'), S3_REGION: z.string().min(1), S3_BUCKET: z.string().min(1), S3_ACCESS_KEY_ID: z.string().min(1), S3_SECRET_ACCESS_KEY: z.string().min(1) }).parse(process.env);
      storage.s3 = new S3FileStorage(config);
    }
    const bundle = await captureRecovery(source, storage, includeSensitive); const wire = await encryptRecovery(bundle, passphrase);
    await writeFile(output, wire, { flag: 'wx', mode: 0o600 }); const id = randomUUID();
    const diffs = JSON.stringify({ format: bundle.format, tables: Object.keys(bundle.manifest).length, rows: Object.values(bundle.manifest).reduce((total, row) => total + row.count, 0), objects: bundle.objects.length, archiveHash: createHash('sha256').update(wire).digest('hex'), includeSensitive: true });
    await source.query('BEGIN');
    try {
      await source.query('INSERT INTO "TimelineEvent" (id,actor,action,"entityType","entityId","batchId","summaryTr","summaryEn",diffs,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)', [randomUUID(), 'owner', 'backup', 'RecoveryBackup', id, id, tr.recoveryBackupCreated, en.recoveryBackupCreated, diffs]);
      await source.query('INSERT INTO "AuditLog" (id,actor,action,"entityType","entityId",diffs,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)', [randomUUID(), 'owner', 'backup', 'RecoveryBackup', id, diffs]);
      await source.query('COMMIT');
    } catch (error) { await source.query('ROLLBACK'); throw error; }
    console.log(JSON.stringify({ encrypted: true, tables: Object.keys(bundle.manifest).length, rows: Object.values(bundle.manifest).reduce((total, row) => total + row.count, 0), objects: bundle.objects.length, fieldKeyIds: bundle.fieldKeyIds }));
  } finally { await source.end(); }
}
try { await main(); } catch (error) { console.error(error instanceof RecoveryError ? error.message : 'RECOVERY_FAILED'); process.exitCode = 1; }
