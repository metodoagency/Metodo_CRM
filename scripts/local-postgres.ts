import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { readConfig } from '../server/config.js';
// Reuse the application's development defaults without duplicating credentials.
// db:up invokes this fallback only for that exact local development target.
const target = new URL(readConfig({ NODE_ENV: 'development' }).DATABASE_URL);
target.pathname = '/postgres';
// Do not construct a second embedded-postgres instance for a live database:
// failed-start cleanup in that library can remove the running server's PID file.
const existing = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 1500 });
let ready = false;
try { await existing.connect(); await existing.query('SELECT 1'); ready = true; } catch { /* inspect a possible startup lock below */ }
finally { await existing.end().catch(() => {}); }
if (ready) { console.log('PostgreSQL already running; existing process preserved'); process.exit(0); }
if (existsSync('.local/postgres/postmaster.pid')) {
  const pid = Number(readFileSync('.local/postgres/postmaster.pid', 'utf8').split(/\r?\n/)[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Existing local PostgreSQL lock needs inspection; refusing a second startup');
  try { process.kill(pid, 0); throw new Error('Local PostgreSQL process exists but is not ready; refusing a second startup'); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
}
const database = new EmbeddedPostgres({ databaseDir: '.local/postgres', port: Number(target.port), user: decodeURIComponent(target.username), password: decodeURIComponent(target.password), authMethod: 'scram-sha-256', persistent: true, initdbFlags: ['--locale=C', '--encoding=UTF8'], postgresFlags: ['-h', target.hostname] });
if (!existsSync('.local/postgres/PG_VERSION')) await database.initialise();
await database.start();
const client = database.getPgClient('postgres');
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = 'metodo'")).rowCount) await client.query('CREATE DATABASE metodo');
await client.end();
process.on('SIGTERM', () => { void database.stop().finally(() => process.exit(0)); });
process.on('SIGINT', () => { void database.stop().finally(() => process.exit(0)); });
setInterval(() => {}, 60000);
