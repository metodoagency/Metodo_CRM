import 'dotenv/config';
import pg from 'pg';
import { cpus, platform, arch } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { run } from './process.js';
run('npm', ['run', 'db:up']);
const url = new URL(process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Performance test requires local PostgreSQL');
url.pathname = '/metodo_perf'; const admin = new URL(url); admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() }); await client.connect();
if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='metodo_perf'")).rowCount) await client.query('CREATE DATABASE metodo_perf');
await client.end();
process.env.DATABASE_URL = url.toString(); process.env.DIRECT_URL = url.toString(); process.env.NODE_ENV = 'test'; process.env.ALLOWED_EMAILS = 'owner@example.com';
run('npm', ['run', 'db:migrate']); run('npm', ['run', 'perf:seed']);
const { db } = await import('../server/db.js');
const { buildApp } = await import('../server/app.js');
const app = await buildApp();
try {
  await db.$executeRawUnsafe('ANALYZE "Player"');
  const signIn = await app.inject({ method: 'POST', url: '/auth/test', headers: { origin: 'http://localhost:5173' }, payload: { email: 'owner@example.com' } });
  if (signIn.statusCode !== 200) throw new Error('Performance auth failed');
  const cookie = String(signIn.headers['set-cookie']).split(';')[0];
  const times: number[] = [];
  for (let i = 0; i < 55; i++) {
    const start = performance.now(); const response = await app.inject({ url: '/api/players', headers: { cookie } });
    if (response.statusCode !== 200 || response.json().items.length !== 50) throw new Error('Default list failed');
    if (i >= 5) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b); const p95 = times[Math.ceil(times.length * .95) - 1];
  const queries = [
    `SELECT * FROM "Player" WHERE "ownerId"='owner' AND "deletedAt" IS NULL ORDER BY "name", "id" LIMIT 50`,
    `SELECT * FROM "Player" WHERE "ownerId"='owner' AND "deletedAt" IS NULL AND "status"='TARGET' ORDER BY "name", "id" LIMIT 50`,
    `SELECT * FROM "Player" WHERE "ownerId"='owner' AND "deletedAt" IS NULL AND "searchName" LIKE '%performans%' ORDER BY "name", "id" LIMIT 50`,
  ];
  const plans = [];
  for (const query of queries) plans.push(await db.$queryRawUnsafe(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`));
  const hasSequential = JSON.stringify(plans).includes('Seq Scan');
  const result = { dataset: await db.player.count(), samples: times.length, p95Milliseconds: Number(p95.toFixed(2)), machine: { platform: platform(), architecture: arch(), cpu: cpus()[0].model, logicalCpus: cpus().length }, plans, passed: p95 < 500 && !hasSequential };
  mkdirSync('.local', { recursive: true }); writeFileSync('.local/performance.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, plans: `${plans.length} plans saved to .local/performance.json` }));
  if (!result.passed) process.exitCode = 1;
} finally { await app.close(); await db.$disconnect(); }
