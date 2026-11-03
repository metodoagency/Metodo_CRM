import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Config } from './config.js';
import { encrypt } from './crypto.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const cookies = { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/' };
export const sessionCookie = '__Host-metodo_session';
export async function registerAuth(app: FastifyInstance, db: PrismaClient, config: Config) {
  app.get('/auth/status', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async () => ({ configured: !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET), testMode: config.testAuth }));
  app.get('/auth/google', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_req, reply) => {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return reply.code(503).send({ code: 'AUTH_NOT_CONFIGURED' });
    const state = random(); const nonce = random(); const verifier = random();
    await db.oAuthAttempt.create({ data: { id: hash(state), nonce, verifier, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    reply.setCookie('__Host-metodo_oauth', state, { ...cookies, maxAge: 600 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.GOOGLE_REDIRECT_URI || `${config.APP_ORIGIN}/auth/google/callback`, response_type: 'code', scope: 'openid email', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return reply.redirect(url.toString());
  });
  async function login(email: string, reply: FastifyReply, previous?: string) {
    if (!config.allowedEmails.includes(email.toLowerCase())) { reply.code(403).send({ code: 'FORBIDDEN' }); return; }
    await db.owner.upsert({ where: { id: 'owner' }, create: { id: 'owner', email: encrypt(email.toLowerCase(), 'Owner.email') }, update: {} });
    const token = random();
    await db.$transaction(async tx => {
      if (previous) await tx.session.deleteMany({ where: { id: hash(previous), ownerId: 'owner' } });
      await tx.session.create({ data: { id: hash(token), ownerId: 'owner', email: encrypt(email.toLowerCase(), 'Session.email'), expiresAt: new Date(Date.now() + 12 * 3600_000) } });
    });
    reply.setCookie(sessionCookie, token, { ...cookies, maxAge: 12 * 3600 });
    return;
  }
  app.get('/auth/google/callback', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const query = z.object({ state: z.string().min(1), code: z.string().min(1) }).safeParse(req.query);
    if (!query.success || query.data.state !== req.cookies['__Host-metodo_oauth']) return reply.code(400).send({ code: 'INVALID_OAUTH' });
    const attempt = await db.oAuthAttempt.findUnique({ where: { id: hash(query.data.state) } });
    if (!attempt || attempt.expiresAt.getTime() < Date.now()) return reply.code(400).send({ code: 'INVALID_OAUTH' });
    const consumed = await db.oAuthAttempt.deleteMany({ where: { id: attempt.id } });
    if (consumed.count !== 1) return reply.code(400).send({ code: 'INVALID_OAUTH' });
    reply.clearCookie('__Host-metodo_oauth', cookies);
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: query.data.code, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: config.GOOGLE_REDIRECT_URI || `${config.APP_ORIGIN}/auth/google/callback`, grant_type: 'authorization_code', code_verifier: attempt.verifier }), signal: AbortSignal.timeout(15000) });
      if (!tokenResponse.ok) return reply.code(401).send({ code: 'INVALID_OAUTH' });
      const token = z.object({ id_token: z.string() }).parse(await tokenResponse.json());
      const { payload } = await jwtVerify(token.id_token, createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')), { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.GOOGLE_CLIENT_ID, algorithms: ['RS256'] });
      if (payload.nonce !== attempt.nonce || payload.email_verified !== true || typeof payload.email !== 'string') return reply.code(401).send({ code: 'INVALID_OAUTH' });
      await login(payload.email, reply, req.cookies[sessionCookie]);
      if (reply.statusCode === 403) return reply;
      return reply.redirect(`${config.APP_ORIGIN}/?signedIn=1`);
    } catch { return reply.code(401).send({ code: 'INVALID_OAUTH' }); }
  });
  if (config.testAuth) app.post('/auth/test', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).strict().parse(req.body);
    await login(email, reply, req.cookies[sessionCookie]);
    if (reply.statusCode === 403) return reply;
    return reply.send({ ok: true });
  });
  app.post('/api/logout', async (req, reply) => {
    if (req.cookies[sessionCookie]) await db.session.deleteMany({ where: { id: hash(req.cookies[sessionCookie]) } });
    reply.clearCookie(sessionCookie, cookies);
    return { ok: true };
  });
  app.post('/api/logout-all', async (_req, reply) => {
    await db.session.deleteMany({ where: { ownerId: 'owner' } });
    reply.clearCookie(sessionCookie, cookies); return { ok: true };
  });
}
