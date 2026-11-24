import { randomUUID } from 'node:crypto';
import type { Tx } from './core.js';

// Prisma's empty-update upsert may execute read+insert. Parallel first-login
// settings/privacy requests must use PostgreSQL's atomic conflict handling.
export async function ensureUserSettings(tx: Tx) {
  await tx.$executeRaw`INSERT INTO "UserSettings" ("id", "ownerId", "updatedAt") VALUES (${randomUUID()}::uuid, ${'owner'}, CURRENT_TIMESTAMP) ON CONFLICT ("ownerId") DO NOTHING`;
  return tx.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } });
}
