import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { registerFiles } from './files.js';
import { createStorage, drainStorageDeletions, type FileStorage } from './storage.js';
import type { MalwareScanner } from './file-validation.js';
import { registerProcessing, type DocumentProcessor } from './processing.js';
import staticFiles from '@fastify/static';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readConfig, type Config } from './config.js';
import { db as defaultDb } from './db.js';
import { hash, registerAuth, sessionCookie } from './auth.js';
import { decrypt, keyring, verifyCsrf } from './crypto.js';
import { registerRoutes } from './routes.js';
import { AppError } from './core.js';
import { loggerOptions } from './logging.js';
import { openapiDocument } from './openapi.js';
import { apiContracts, emptyObject } from '../shared/contracts.js';

export async function buildApp(options: { db?: PrismaClient; config?: Config; storage?: FileStorage; scanner?: MalwareScanner; processors?: readonly DocumentProcessor[] } = {}) {
  const db = options.db ?? defaultDb; const config = options.config ?? readConfig();
  const storage = options.storage ?? createStorage(config);
  keyring();
  const trustedProxies = config.TRUSTED_PROXY_CIDRS.split(',').map(value => value.trim()).filter(Boolean);
  const app = Fastify({ bodyLimit: 1024 * 1024, logger: loggerOptions, trustProxy: trustedProxies.length ? trustedProxies : false });
  await app.register(cookie);
  await app.register(multipart, { limits: { files: 1, fields: 0, parts: 1, fileSize: 10 * 1024 * 1024 } });
  await app.register(helmet, {
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      connectSrc: ["'self'"], frameAncestors: ["'self'", 'https://sites.google.com', 'https://*.google.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
    } }, xFrameOptions: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  await app.register(rateLimit, { global: false });
  // Run before session lookup: an arbitrary cookie must not cause unbounded DB work.
  // Independent createRateLimit counters avoid the plugin's once-per-request hook flag.
  const preAuthLimit = app.createRateLimit({ max: 600, timeWindow: '1 minute', keyGenerator: req => req.ip });
  const sessionLimit = app.createRateLimit({ max: 300, timeWindow: '1 minute', keyGenerator: req => hash(req.cookies[sessionCookie]!) });
  app.addHook('preValidation', async req => {
    const contract = apiContracts.find(route => route.path === req.routeOptions.url && route.method.toUpperCase() === (req.method === 'HEAD' ? 'GET' : req.method));
    if (!contract) return;
    (contract.query ?? emptyObject).parse(req.query);
    (contract.params ?? emptyObject).parse(req.params);
    if (contract.body) contract.body.parse(req.body);
    else if (req.body !== undefined) emptyObject.parse(req.body);
  });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Use the matched route, never a user-controlled raw URL prefix, to decide
    // which routes require authentication (including encoded path variants).
    const apiRoute = req.routeOptions.url?.startsWith('/api/') ?? false;
    if (apiRoute) reply.header('cache-control', 'no-store');
    if (apiRoute || ['/health', '/healthz'].includes(req.routeOptions.url ?? '')) {
      const limit = await preAuthLimit(req);
      if (!limit.isAllowed && limit.isExceeded) return reply.header('retry-after', limit.ttlInSeconds).code(429).send({ code: 'RATE_LIMITED' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (apiRoute || req.routeOptions.url === '/auth/test')) {
      if (req.headers.origin !== new URL(config.APP_ORIGIN).origin) return reply.code(403).send({ code: 'INVALID_ORIGIN' });
    }
    if (!apiRoute) return;
    const token = req.cookies[sessionCookie];
    const session = token ? await db.session.findUnique({ where: { id: hash(token) } }) : null;
    if (!session || session.expiresAt.getTime() <= Date.now() || session.lastSeenAt.getTime() < Date.now() - 3600_000) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    if (!config.allowedEmails.includes(decrypt(session.email, 'Session.email'))) return reply.code(403).send({ code: 'FORBIDDEN' });
    const limit = await sessionLimit(req);
    if (!limit.isAllowed && limit.isExceeded) return reply.header('retry-after', limit.ttlInSeconds).code(429).send({ code: 'RATE_LIMITED' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !verifyCsrf(token!, req.headers['x-csrf-token'])) return reply.code(403).send({ code: 'INVALID_CSRF' });
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_INPUT', fields: error.issues.map(i => i.path.join('.')) });
    if (error instanceof AppError) return reply.code(error.status).send({ code: error.code });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2014', 'P2002'].includes(error.code)) return reply.code(409).send({ code: 'LINKED_RECORDS' });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2025', 'P2034'].includes(error.code)) return reply.code(409).send({ code: 'STALE_VERSION' });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) return reply.code(error.statusCode).send({ code: 'INVALID_INPUT' });
    // No request bodies, tokens or database errors are logged.
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return reply.code(500).send({ code: 'INTERNAL_ERROR' });
  });
  app.get('/health', async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ok' }; } catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.get('/healthz', async (_req, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: 'ok' }; } catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  await registerAuth(app, db, config);
  app.addHook('onResponse', async (req, reply) => {
    if (!storage || reply.statusCode < 200 || reply.statusCode >= 300) return;
    if (!['POST', 'DELETE'].includes(req.method) || !['/api/admin/retention/purge', '/api/admin/examples/cleanup', '/api/trash/:id'].includes(req.routeOptions.url ?? '')) return;
    // Only already committed purge jobs can be consumed. Storage failures leave
    // the durable queue for owner retry or daily maintenance.
    await drainStorageDeletions(db, storage).catch(() => app.log.warn('File cleanup deferred'));
  });
  await registerRoutes(app, db);
  await registerFiles(app, db, config, storage, options.scanner);
  await registerProcessing(app, db, config, options.processors);
  app.get('/api/docs', async () => openapiDocument());
  if (config.NODE_ENV === 'production' && existsSync(resolve('dist/web/index.html'))) {
    await app.register(staticFiles, { root: resolve('dist/web') });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/auth') || req.url.includes('.')) return reply.code(404).send({ code: 'NOT_FOUND' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
