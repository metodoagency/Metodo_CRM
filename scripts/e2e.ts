import 'dotenv/config';
import { join } from 'node:path';
import pg from 'pg';
import { run } from './process.js';
const url = new URL(process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('E2E requires local PostgreSQL; external database is protected');
run('npm', ['run', 'db:up']);
url.pathname = '/metodo_e2e'; const admin = new URL(url); admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() }); await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='metodo_e2e'")).rowCount) await client.query('CREATE DATABASE metodo_e2e');
await client.end();
const args = process.argv.slice(2);
// Retained binary-upload scenarios verify legacy compatibility only. The new
// resource workspace and every deployed configuration use drive mode.
const legacyUploadProjects = new Set(['chromium', 'club-workspace', 'contract-workspace']);
const legacySelection = args.some(arg => arg.startsWith('--project=') && legacyUploadProjects.has(arg.slice('--project='.length)));
const env = {
  ...process.env,
  NODE_ENV: 'test', E2E_TEST_MODE: 'true', ALLOWED_EMAILS: 'owner@example.com',
  HOST: '127.0.0.1', PORT: '3000', APP_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: url.toString(), DIRECT_URL: url.toString(),
  STORAGE_DRIVER: 'local', STORAGE_PATH: '.local/e2e-uploads', EXTERNAL_PROCESSING_ENABLED: 'false', CLAMAV_ENABLED: 'false',
  FILE_STORAGE_MODE: legacySelection ? 'upload' : 'drive',
};
run('npx', ['prisma', 'migrate', 'deploy'], env); run('npm', ['run', 'seed:example'], env);
if (args.length) {
  run('npx', ['playwright', 'test', ...args], env);
} else {
  // Restart the test servers between suites so rapid scans do not inherit
  // the earlier Chromium scenarios' API and authentication rate counters.
  const reportRoot = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? 'playwright-report';
  for (const project of ['chromium', 'club-workspace', 'transfer-workspace', 'contract-workspace', 'agenda-workspace', 'meeting-workspace', 'agenda-layers', 'dashboard-workspace', 'resource-workspace', 'a11y']) {
    run('npx', ['playwright', 'test', `--project=${project}`, `--output=test-results/${project}`], {
      ...env, FILE_STORAGE_MODE: legacyUploadProjects.has(project) ? 'upload' : 'drive', PLAYWRIGHT_HTML_OUTPUT_DIR: join(reportRoot, project),
    });
  }
}
