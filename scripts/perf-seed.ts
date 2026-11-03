import { randomUUID } from 'node:crypto';
import { db } from '../server/db.js';
import { encrypt } from '../server/crypto.js';
if (process.env.NODE_ENV === 'production') throw new Error('Performance seed is forbidden in production');
if (!['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('Performance seed requires local PostgreSQL');
try {
  await db.owner.upsert({ where: { id: 'owner' }, create: { email: encrypt('owner@example.com', 'Owner.email') }, update: {} });
  const count = await db.player.count({ where: { isExample: true, name: { startsWith: 'Örnek Performans ' } } });
  for (let i = count; i < 10000; i += 500) await db.player.createMany({ data: Array.from({ length: Math.min(500, 10000 - i) }, (_, j) => ({ id: randomUUID(), name: `Örnek Performans ${String(i + j).padStart(5, '0')}`, searchName: `ornek performans ${String(i + j).padStart(5, '0')}`, primaryPosition: 'CM' as const, status: 'TARGET' as const, isExample: true, nationalities: [], secondaryPositions: [] })) });
  console.log('10,000 fictional performance players ready');
} finally { await db.$disconnect(); }
