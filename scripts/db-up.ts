import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import pg from 'pg';
import { readConfig } from '../server/config.js';

const fallback = readConfig({ NODE_ENV: 'development' }).DATABASE_URL;
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
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/local-postgres.ts'], { detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env });
    child.unref();
  }
}
// A Windows crash-recovery fsync can exceed45 seconds. Keep a live server's
// lock intact and wait for readiness rather than starting another instance.
const deadline = Date.now() + 180000;
let nextStatus = Date.now() + 30000;
while (Date.now() < deadline) {
  if (await reachable()) { console.log('PostgreSQL ready'); process.exit(0); }
  if (Date.now() >= nextStatus) { console.log('Waiting for local PostgreSQL startup/recovery'); nextStatus = Date.now() + 30000; }
  await new Promise(r => setTimeout(r, 1000));
}
throw new Error('PostgreSQL startup failed; inspect .local/postgres.log or docker compose logs db');
