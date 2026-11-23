import { Prisma, type Contract, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { encrypt, decrypt } from './crypto.js';
import { AppError, logEvent } from './core.js';
import { isPrivateSourceUrl, maskPrivateLinks } from '../shared/private-links.js';
import type { ContractInput } from '../shared/player-contracts.js';

const evidenceSchema = z.object({ version: z.literal(1), sourceUrl: z.string().nullable(), fieldProvenance: z.record(z.string(), z.json()) }).strict();
type Evidence = z.infer<typeof evidenceSchema>;
export function contractSourceEvidence(row?: Pick<Contract, 'privateSourceEvidence'>): Evidence {
  return row && row.privateSourceEvidence !== null ? evidenceSchema.parse(JSON.parse(decrypt(row.privateSourceEvidence, 'Contract.privateSourceEvidence'))) : { version: 1, sourceUrl: null, fieldProvenance: {} };
}
export function contractDocumentLink(row: Pick<Contract, 'privateDocumentLink' | 'documentLink'>) {
  return row.privateDocumentLink !== null ? decrypt(row.privateDocumentLink, 'Contract.privateDocumentLink') : row.documentLink;
}
export function contractSourceUrl(row: Pick<Contract, 'privateSourceEvidence' | 'sourceUrl'>) {
  return contractSourceEvidence(row).sourceUrl ?? row.sourceUrl;
}
// Preserve omitted fields and legacy non-Drive document URLs. Corrupt encrypted
// evidence must fail closed; it never falls back to the old plaintext column.
export function protectedContractEvidence(changes: Partial<ContractInput>, before?: Contract): Prisma.ContractUncheckedUpdateInput {
  const result: Prisma.ContractUncheckedUpdateInput = {};
  const evidence = contractSourceEvidence(before);
  if (before && before.privateDocumentLink !== null && !('documentLink' in changes)) contractDocumentLink(before);
  if ('documentLink' in changes || before?.documentLink) {
    const value = 'documentLink' in changes ? changes.documentLink : before?.documentLink;
    if (!('documentLink' in changes) && before && before.privateDocumentLink !== null && contractDocumentLink(before) !== value) throw new AppError('CONTRACT_LINK_CONFLICT', 409);
    result.privateDocumentLink = value ? encrypt(value, 'Contract.privateDocumentLink') : null;
    result.documentLink = null;
  }
  if (!('sourceUrl' in changes) && before?.sourceUrl != null && evidence.sourceUrl !== null && before.sourceUrl !== evidence.sourceUrl) throw new AppError('CONTRACT_LINK_CONFLICT', 409);
  const sourceUrl = changes.sourceUrl ?? evidence.sourceUrl ?? before?.sourceUrl ?? null;
  const previous = before?.fieldProvenance;
  if (previous && typeof previous === 'object' && !Array.isArray(previous)) for (const [key, value] of Object.entries(evidence.fieldProvenance)) {
    if (!(key in changes) && key in previous && JSON.stringify(previous[key]) !== JSON.stringify(value)) throw new AppError('CONTRACT_LINK_CONFLICT', 409);
  }
  const sources: Prisma.JsonObject = { ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), ...evidence.fieldProvenance };
  for (const key of Object.keys(changes)) sources[key] = { sourceUrl, sourceType: 'MANUAL', retrievedAt: new Date().toISOString(), verificationStatus: 'UNVERIFIED' };
  const publicSources: Prisma.JsonObject = {}; const privateSources: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries(sources)) (JSON.stringify(maskPrivateLinks(value)) !== JSON.stringify(value) ? privateSources : publicSources)[key] = value;
  const next = evidenceSchema.parse({ version: 1, sourceUrl: isPrivateSourceUrl(sourceUrl) ? sourceUrl : null, fieldProvenance: privateSources });
  if ('sourceUrl' in changes || isPrivateSourceUrl(before?.sourceUrl)) result.sourceUrl = next.sourceUrl ? null : sourceUrl;
  if (JSON.stringify(publicSources) !== JSON.stringify(previous ?? {})) result.fieldProvenance = publicSources as Prisma.InputJsonObject;
  if (JSON.stringify(next) !== JSON.stringify(evidence)) result.privateSourceEvidence = next.sourceUrl || Object.keys(privateSources).length ? encrypt(JSON.stringify(next), 'Contract.privateSourceEvidence') : null;
  return result;
}

// Explicit owner maintenance includes Trash. Each row has an optimistic guard
// and an atomic write plus value-free event. A second run changes nothing.
export async function protectLegacyContractLinks(db: PrismaClient) {
  const counts = { contracts: 0, timeline: 0, audit: 0 };
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.contract.findMany({ where: { ownerId: 'owner', ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 100 });
    if (!rows.length) break;
    for (const row of rows) {
      const data = protectedContractEvidence({}, row); if (!Object.keys(data).length) continue;
      await db.$transaction(async tx => {
        const changed = await tx.contract.updateMany({ where: { id: row.id, ownerId: 'owner', version: row.version }, data: { ...data, version: { increment: 1 } } });
        if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
        await logEvent(tx, { entityType: 'Contract', entityId: row.id, name: row.name, action: 'update', diffs: { protectedLegacyLinks: true, fields: Object.keys(data) }, isExample: row.isExample });
      }); counts.contracts++;
    } cursor = rows.at(-1)!.id;
  }
  for (const model of ['timelineEvent', 'auditLog'] as const) {
    cursor = undefined;
    for (;;) {
      const query: { where: { ownerId: string; id?: { gt: string } }; orderBy: { id: 'asc' }; take: number; select: { id: true; version: true; diffs: true; privateSourceEvidence: true } } = {
        where: { ownerId: 'owner', ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 100, select: { id: true, version: true, diffs: true, privateSourceEvidence: true },
      };
      const rows: { id: string; version: number; diffs: Prisma.JsonValue; privateSourceEvidence: string | null }[] = model === 'timelineEvent' ? await db.timelineEvent.findMany(query) : await db.auditLog.findMany(query);
      if (!rows.length) break;
      for (const row of rows) {
        const masked = maskPrivateLinks(row.diffs) as Prisma.InputJsonValue;
        if (JSON.stringify(masked) === JSON.stringify(row.diffs)) continue;
        if (row.privateSourceEvidence !== null) throw new AppError('CONTRACT_LINK_CONFLICT', 409);
        const data = { diffs: masked, privateSourceEvidence: encrypt(JSON.stringify(row.diffs), `${model === 'auditLog' ? 'AuditLog' : 'TimelineEvent'}.privateSourceEvidence`), version: { increment: 1 } };
        const update = { where: { id: row.id, ownerId: 'owner', version: row.version }, data };
        const changed = model === 'timelineEvent' ? await db.timelineEvent.updateMany(update) : await db.auditLog.updateMany(update);
        if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
        counts[model === 'auditLog' ? 'audit' : 'timeline']++;
      } cursor = rows.at(-1)!.id;
    }
  }
  return counts;
}
