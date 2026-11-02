import 'dotenv/config';
import pg from 'pg';
import { run } from './process.js';
// Tests own a separate database and never truncate development/production data.
run('npm', ['run', 'db:up']);
const url = new URL(process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo');
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Tests require a local database; external DATABASE_URL is protected');
url.pathname = '/metodo_test';
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = 'metodo_test'")).rowCount) await client.query('CREATE DATABASE metodo_test');
await client.end();
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(), NODE_ENV: 'test', ALLOWED_EMAILS: 'owner@example.com' };
run('npx', ['prisma', 'migrate', 'deploy'], env);
run('npx', ['vitest', 'run', ...process.argv.slice(2)], env);
