import { beforeAll, afterAll, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.js';
import { db } from '../server/db.js';
import { readConfig } from '../server/config.js';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp({ db, config: readConfig({ ...process.env, NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:5173', ALLOWED_EMAILS: 'owner@example.com' }) }); });
afterAll(async () => { await app.close(); await db.$disconnect(); });
it('sensitive paths: concurrent first-login settings/privacy reads create one default row without hiding the notice', async () => {
  if (!process.env.DATABASE_URL?.endsWith('/metodo_test')) throw new Error('Unsafe test database');
  await db.$executeRawUnsafe(`TRUNCATE ${Prisma.dmmf.datamodel.models.map(model => `"${model.dbName || model.name}"`).join(',')} CASCADE`);
  const result = await app.inject({ method: 'POST', url: '/auth/test', headers: { origin: 'http://localhost:5173' }, payload: { email: 'owner@example.com' } });
  const cookie = String(result.headers['set-cookie']).split(';')[0];
  const paths = ['/api/settings', '/api/privacy', '/api/admin/retention', '/api/task-rules/presentation'];
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => app.inject({ url: paths[index % paths.length], headers: { cookie } })));
  expect(responses.map(response => response.statusCode)).toEqual(Array(12).fill(200)); expect(await db.userSettings.count()).toBe(1);
  for (let index = 0; index < responses.length; index++) if (paths[index % paths.length] === '/api/privacy') expect(responses[index].json()).toMatchObject({ acknowledgementRequired: true, acceptedVersion: null });
  expect(await db.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } })).toMatchObject({ version: 1, presentationFollowUpTasksEnabled: false, privacyAcknowledgedAt: null });
});
