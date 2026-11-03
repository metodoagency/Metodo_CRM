import { db } from '../server/db.js';
import { decrypt, encrypt, encryptedFields, keyring } from '../server/crypto.js';
import { logEvent } from '../server/core.js';
// Environment access authorizes this owner-only maintenance command. Keep old
// keys configured until the complete database and backups have been rotated.
try {
  const ring = keyring(); let count = 0;
  if (!/^[a-zA-Z0-9_-]+$/.test(ring.active)) throw new Error('Invalid key id');
  for (const [model, fields] of Object.entries(encryptedFields)) {
    for (const field of fields) {
      for (;;) {
        const business = model !== 'Session' && model !== 'Owner';
        const rows = await db.$queryRawUnsafe<{ id: string; value: string; isExample: boolean }[]>(`SELECT "id", "${field}" AS value, ${business ? '"isExample"' : 'false'} AS "isExample" FROM "${model}" WHERE "${field}" IS NOT NULL AND "${field}" NOT LIKE $1 LIMIT 100`, `v1.${ring.active}.%`);
        if (!rows.length) break;
        for (const row of rows) {
          const next = encrypt(decrypt(row.value, `${model}.${field}`, ring), `${model}.${field}`, ring);
          await db.$transaction(async tx => {
            const updated = await tx.$executeRawUnsafe(`UPDATE "${model}" SET "${field}" = $1${business ? ', "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP' : ''} WHERE "id" = $2${business ? '::uuid' : ''} AND "${field}" = $3`, next, row.id, row.value);
            if (updated && business) await logEvent(tx, { entityType: model, entityId: row.id, action: 'update', name: model, diffs: { [field]: '***' }, isExample: row.isExample });
            count += updated;
          });
        }
      }
    }
  }
  console.log(`Re-encrypted fields: ${count}`);
} finally { await db.$disconnect(); }
