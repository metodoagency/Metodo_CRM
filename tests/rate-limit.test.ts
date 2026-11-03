import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { encrypt } from '../server/crypto.js';
import { hash } from '../server/auth.js';

function fixture(authenticated = false) {
  let lookups = 0; let attempts = 0; let healthQueries = 0;
  const db = {
    $queryRaw: async () => { healthQueries++; return []; },
    session: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        lookups++;
        return authenticated ? { id: where.id, email: encrypt('owner@example.com', 'Session.email'), expiresAt: new Date(Date.now() + 3600000), lastSeenAt: new Date() } : null;
      },
      update: async () => ({}),
    },
    oAuthAttempt: { create: async () => { attempts++; return {}; } },
  } as unknown as PrismaClient;
  const config = readConfig({ NODE_ENV: 'test', ALLOWED_EMAILS: 'owner@example.com', GOOGLE_CLIENT_ID: 'example-client', GOOGLE_CLIENT_SECRET: 'example-secret' });
  return { db, config, counts: () => ({ lookups, attempts, healthQueries }) };
}

describe('rate-limit boundaries', () => {
  it('shares the pre-query IP budget across both health routes', async () => {
    const f = fixture(); const app = await buildApp(f);
    try {
      for (let i = 0; i < 600; i++) expect((await app.inject(i % 2 ? '/health' : '/healthz')).statusCode).toBe(200);
      expect((await app.inject('/health')).statusCode).toBe(429);
      expect((await app.inject('/healthz')).statusCode).toBe(429);
      expect(f.counts().healthQueries).toBe(600);
    } finally { await app.close(); }
  });
  it('throttles stable and rotating invalid cookies before database lookup', async () => {
    for (const rotating of [false, true]) {
      const f = fixture(); const app = await buildApp(f);
      try {
        for (let i = 0; i < 600; i++) expect((await app.inject({ url: '/api/me', headers: { cookie: `__Host-metodo_session=invalid-${rotating ? i : 0}` } })).statusCode).toBe(401);
        const blocked = await app.inject({ url: '/api/me', headers: { cookie: '__Host-metodo_session=another-invalid-cookie' } });
        expect(blocked.statusCode).toBe(429); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        expect(f.counts().lookups).toBe(600);
      } finally { await app.close(); }
    }
  });
  it('limits a valid session across changing network addresses', async () => {
    const f = fixture(true); const app = await buildApp(f);
    try {
      for (let i = 0; i < 300; i++) expect((await app.inject({ url: '/api/me', remoteAddress: `127.1.${Math.floor(i / 250)}.${i % 250 + 1}`, headers: { cookie: '__Host-metodo_session=example-session' } })).statusCode).toBe(200);
      expect((await app.inject({ url: '/api/me', remoteAddress: '127.2.0.1', headers: { cookie: '__Host-metodo_session=example-session' } })).statusCode).toBe(429);
      expect((await app.inject({ url: '/api/me', remoteAddress: '127.2.0.2', headers: { cookie: '__Host-metodo_session=another-example-session' } })).statusCode).toBe(200);
      expect(hash('example-session')).not.toBe(hash('another-example-session'));
    } finally { await app.close(); }
  });
  it('does not let forwarded addresses bypass production authentication limits', async () => {
    const f = fixture(); const app = await buildApp({ db: f.db, config: { ...f.config, NODE_ENV: 'production', testAuth: false } });
    try {
      for (let i = 0; i < 12; i++) {
        const response = await app.inject({ url: '/auth/google', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': `192.0.2.${i + 1}` } });
        expect(response.statusCode).toBe(i < 10 ? 302 : 429);
      }
      expect(f.counts().attempts).toBe(10);
    } finally { await app.close(); }
  });
  it('trusts only the configured peer and stops at the first untrusted address', async () => {
    const f = fixture(); const app = await buildApp({ db: f.db, config: { ...f.config, TRUSTED_PROXY_CIDRS: '127.0.0.2' } });
    try {
      for (let i = 0; i < 12; i++) {
        const direct = await app.inject({ url: '/auth/google', remoteAddress: '127.0.0.3', headers: { 'x-forwarded-for': `192.0.2.${i + 1}` } });
        expect(direct.statusCode).toBe(i < 10 ? 302 : 429);
        const proxied = await app.inject({ url: '/auth/google', remoteAddress: '127.0.0.2', headers: { 'x-forwarded-for': `198.51.100.${i + 1}, 192.0.2.1` } });
        expect(proxied.statusCode).toBe(i < 10 ? 302 : 429);
      }
      expect(f.counts().attempts).toBe(20);
    } finally { await app.close(); }
  });
});
