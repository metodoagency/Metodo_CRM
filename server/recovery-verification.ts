import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { isLocalRecoveryServer, RecoveryError, restoreRecoveryRows, sqlName, validateRecovery, type RecoveryBundle } from './recovery.js';

export function localRecoveryAdmin(value: string) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.search) throw new RecoveryError('LOCAL_DATABASE_REQUIRED');
  url.pathname = '/postgres'; return url;
}
function migrateTemporary(url: string) {
  const npm = process.env.npm_execpath; if (!npm) throw new RecoveryError('RUN_THROUGH_NPM');
  const result = spawnSync(process.execPath, [join(dirname(npm), 'npx-cli.js'), 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: 'pipe', windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new RecoveryError('TEMPORARY_MIGRATION_FAILED');
}
export async function isolateRecoveryDatabase(admin: pg.Client, name: string) {
  const target = (await admin.query<{ database: string; host: string }>('SELECT current_database() AS database, host(inet_server_addr()) AS host')).rows[0];
  if (!/^metodo_recovery_[a-f0-9]{24}$/.test(name) || target.database !== 'postgres' || !isLocalRecoveryServer(target.host)) throw new RecoveryError('TEMPORARY_DATABASE_REQUIRED');
  const owner = (await admin.query<{ owned: boolean }>('SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1', [name])).rows[0];
  if (!owner?.owned) throw new RecoveryError('TEMPORARY_DATABASE_OWNER_REQUIRED');
  await admin.query(`REVOKE ALL PRIVILEGES ON DATABASE ${sqlName(name)} FROM PUBLIC`);
  const open = (await admin.query<{ open: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=$1 AND a.privilege_type='CONNECT' AND a.grantee<>d.datdba) AS open`, [name])).rows[0].open;
  const appAccess = (await admin.query<{ open: boolean }>(`SELECT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('metodo_app','anon','authenticated') AND NOT r.rolsuper AND has_database_privilege(r.oid,$1,'CONNECT')) AS open`, [name])).rows[0].open;
  if (open || appAccess) throw new RecoveryError('TEMPORARY_DATABASE_ACCESS_NOT_ISOLATED');
}
// This target lives only in this verification call. No HTTP app, jobs,
// processors, ShareLink consumers, cleanup worker or source-storage write runs.
async function restoreTemporaryObjects(bundle: RecoveryBundle) {
  const target = new Map<string, Buffer>();
  try {
    for (const object of bundle.objects) target.set(`${object.driver}:${object.key}`, Buffer.from(object.data, 'base64'));
    for (const object of bundle.objects) {
      const bytes = target.get(`${object.driver}:${object.key}`);
      if (!bytes || bytes.length !== object.size || createHash('sha256').update(bytes).digest('hex') !== object.checksum) throw new RecoveryError('OBJECT_RESTORE_MISMATCH');
    }
    return { count: target.size, bytes: [...target.values()].reduce((total, bytes) => total + bytes.length, 0), target: 'isolated-memory' as const };
  } finally { for (const bytes of target.values()) bytes.fill(0); target.clear(); }
}
export async function verifyRecoveryInTemporaryDatabase(bundle: RecoveryBundle, localUrl: string) {
  validateRecovery(bundle); const adminUrl = localRecoveryAdmin(localUrl); const admin = new pg.Client({ connectionString: adminUrl.toString() });
  const name = 'metodo_recovery_' + randomBytes(12).toString('hex'); const temporaryUrl = new URL(adminUrl); temporaryUrl.pathname = '/' + name;
  let created = false; let client: pg.Client | undefined;
  await admin.connect();
  try {
    const host = (await admin.query<{ host: string }>('SELECT host(inet_server_addr()) AS host')).rows[0].host;
    if (!isLocalRecoveryServer(host)) throw new RecoveryError('LOCAL_DATABASE_REQUIRED');
    await admin.query(`CREATE DATABASE ${sqlName(name)} TEMPLATE template0`); created = true;
    await isolateRecoveryDatabase(admin, name); migrateTemporary(temporaryUrl.toString()); await isolateRecoveryDatabase(admin, name);
    client = new pg.Client({ connectionString: temporaryUrl.toString() }); await client.connect();
    const result = await restoreRecoveryRows(client, bundle, name); const objects = await restoreTemporaryObjects(bundle);
    return { ...result, objectRestore: objects, verifiedAt: new Date().toISOString(), temporaryDatabase: name, databaseAccess: 'creator-only' as const, applicationStarted: false as const };
  } finally {
    try { await client?.end(); }
    finally {
      try { if (created && /^metodo_recovery_[a-f0-9]{24}$/.test(name) && new URL(temporaryUrl).pathname === '/' + name) await admin.query(`DROP DATABASE ${sqlName(name)}`); }
      finally { await admin.end(); }
    }
  }
}
