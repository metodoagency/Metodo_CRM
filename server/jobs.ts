import { pathToFileURL } from 'node:url';
import { db } from './db.js';
import { readConfig } from './config.js';
import { createStorage, drainStorageDeletions } from './storage.js';
export async function dailyJobs() {
  const now = new Date();
  const expiredSessions = await db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { lastSeenAt: { lt: new Date(now.getTime() - 3600_000) } }] } });
  const expiredOAuth = await db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: now } } });
  const storage = createStorage(readConfig());
  const files = storage ? await drainStorageDeletions(db, storage, now) : { removed: 0, pending: 0 };
  // Business retention is manual, through a fresh owner-confirmed preview only.
  return { expiredSessions: expiredSessions.count, expiredOAuth: expiredOAuth.count, files, trash: { purged: 0, blocked: 0 } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await dailyJobs())); } finally { await db.$disconnect(); }
}
