import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import pg from 'pg';

const fallback = 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo';
const connectionString = process.env.DATABASE_URL || fallback;
async function reachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 1500 });
  try { await client.connect(); await client.query('SELECT 1'); return true; } catch { return false; } finally { await client.end().catch(() => {}); }
}
if (await reachable()) { console.log('PostgreSQL ready'); process.exit(0); }
if (connectionString !== fallback) throw new Error('Configured DATABASE_URL is unreachable; refusing to replace an external database');
const docker = spawnSync('docker', ['compose', 'up', '-d', 'db'], { stdio: 'inherit', timeout: 120000 });
if (docker.status !== 0) {
  // Prefer an existing system service, then a version-pinned, real PostgreSQL 16
  // binary for unprivileged environments without a service manager.
  spawnSync('pg_ctlcluster', ['16', 'main', 'start'], { stdio: 'ignore' });
  if (!await reachable()) {
    mkdirSync('.local', { recursive: true });
    const log = openSync('.local/postgres.log', 'a');
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/local-postgres.ts'], { detached: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
  }
}
for (let i = 0; i < 90; i++) {
  if (await reachable()) { console.log('PostgreSQL ready'); process.exit(0); }
  await new Promise(r => setTimeout(r, 500));
}
throw new Error('PostgreSQL startup failed; inspect .local/postgres.log or docker compose logs db');
