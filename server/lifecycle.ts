import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError, live, logEvent, type EntityType, type Tx } from './core.js';
import { retentionPeriods, type RetentionPlan } from '../shared/retention.js';

// Identifiers come exclusively from the compiled Prisma schema. All data values
// are parameters; no request value can become a SQL identifier.
const models = Prisma.dmmf.datamodel.models.filter(model => model.fields.some(field => field.name === 'isExample'));
type GraphRow = { id: string; version: number; isExample: boolean; deletedAt: Date | null; [key: string]: unknown };
type ForeignKey = { fromType: string; fromField: string; toType: string; toField: string };
type Graph = Map<string, GraphRow[]> & { foreignKeys: ForeignKey[] };
const keyOf = (type: string, id: string) => `${type}:${id}`;
const table = (name: string) => {
  const model = models.find(model => model.name === name);
  if (!model) throw new AppError('INVALID_ENTITY');
  return Prisma.raw(`"${model.dbName ?? model.name}"`);
};
async function loadGraph(tx: Tx): Promise<Graph> {
  // Prisma's production runtime DMMF intentionally omits relationFromFields.
  // Read the actual PostgreSQL constraints rather than assuming those runtime
  // objects contain the full generator metadata.
  const constraints = await tx.$queryRaw<ForeignKey[]>`SELECT src.relname::text AS "fromType", sa.attname::text AS "fromField", dst.relname::text AS "toType", da.attname::text AS "toField"
    FROM pg_constraint c JOIN pg_class src ON src.oid = c.conrelid JOIN pg_namespace ns ON ns.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = c.confrelid JOIN LATERAL unnest(c.conkey, c.confkey) AS keys(srcnum, dstnum) ON true
    JOIN pg_attribute sa ON sa.attrelid = src.oid AND sa.attnum = keys.srcnum
    JOIN pg_attribute da ON da.attrelid = dst.oid AND da.attnum = keys.dstnum
    WHERE c.contype = 'f' AND ns.nspname = current_schema()`;
  const graph: Graph = Object.assign(new Map<string, GraphRow[]>(), { foreignKeys: constraints.filter(edge => models.some(model => (model.dbName ?? model.name) === edge.fromType) && models.some(model => (model.dbName ?? model.name) === edge.toType)) });
  for (const model of models) {
    const columns = model.fields.filter(field => field.kind !== 'object' && (['id', 'version', 'isExample', 'deletedAt', 'entityType', 'targetType', 'fromType', 'toType', 'scope', 'participants', 'linkedEntities'].includes(field.name) || /Ids?$/.test(field.name) && field.name !== 'ownerId')).map(field => `"${field.dbName ?? field.name}"`).join(', ');
    graph.set(model.name, await tx.$queryRaw<GraphRow[]>(Prisma.sql`SELECT ${Prisma.raw(columns)} FROM ${table(model.name)} WHERE "ownerId" = ${'owner'}`));
  }
  return graph;
}
function references(graph: Graph, type: string, row: GraphRow): string[] {
  const result: string[] = [];
  for (const edge of graph.foreignKeys.filter(edge => edge.fromType === type)) if (typeof row[edge.fromField] === 'string') result.push(keyOf(edge.toType, String(row[edge.fromField])));
  for (const [typeField, idField] of [['entityType', 'entityId'], ['targetType', 'targetId'], ['fromType', 'fromId'], ['toType', 'toId']]) if (typeof row[typeField] === 'string' && typeof row[idField] === 'string') result.push(keyOf(String(row[typeField]), String(row[idField])));
  if (type === 'ShareLink' && typeof row.entityId === 'string') {
    // Share scopes are not always model names. UUIDs are global across tables.
    for (const model of models) result.push(keyOf(model.name, row.entityId));
  }
  if (Array.isArray(row.linkedClubIds)) for (const id of row.linkedClubIds) result.push(keyOf('Club', String(id)));
  for (const field of ['participants', 'linkedEntities']) if (Array.isArray(row[field])) for (const entry of row[field]) {
    if (entry && typeof entry === 'object' && 'type' in entry && 'id' in entry) result.push(keyOf(String(entry.type), String(entry.id)));
  }
  return result;
}
function selection(graph: Graph, roots: Set<string>, preserveHistory = false) {
  const chosen = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [type, rows] of graph) {
      if (preserveHistory && ['TimelineEvent', 'AuditLog'].includes(type)) continue;
      for (const row of rows) if (!chosen.has(keyOf(type, row.id)) && references(graph, type, row).some(ref => chosen.has(ref))) { chosen.add(keyOf(type, row.id)); changed = true; }
    }
  }
  return chosen;
}
function preview(graph: Graph, selected: Set<string>) {
  const records = [...graph].flatMap(([type, rows]) => rows.filter(row => selected.has(keyOf(type, row.id))).map(row => ({ type, id: row.id, version: row.version }))).sort((a, b) => keyOf(a.type, a.id).localeCompare(keyOf(b.type, b.id), 'en'));
  const counts: Record<string, number> = {};
  for (const row of records) counts[row.type] = (counts[row.type] ?? 0) + 1;
  return { total: records.length, counts, records, previewToken: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
}

export const retentionTables = Prisma.dmmf.datamodel.models.map(model => ({ type: model.name, mode: model.fields.some(field => field.name === 'deletedAt') ? 'softDeleted' as const : ['Session', 'OAuthAttempt'].includes(model.name) ? 'securityExpiry' as const : 'protected' as const }));
export function validateRetentionPeriods(input: unknown) {
  const periods = retentionPeriods.parse(input);
  if (Object.keys(periods).some(type => !retentionTables.some(table => table.type === type && table.mode === 'softDeleted'))) throw new AppError('INVALID_ENTITY');
  return periods;
}

export async function retentionPreview(tx: Tx, type: string, asOf = new Date()) {
  if (!retentionTables.some(table => table.type === type && table.mode === 'softDeleted')) throw new AppError('INVALID_ENTITY');
  const settings = await tx.userSettings.findUniqueOrThrow({ where: { ownerId: 'owner' } });
  const days = validateRetentionPeriods(settings.retentionDays)[type] ?? null;
  const graph = await loadGraph(tx);
  const cutoff = days === null ? null : new Date(asOf.getTime() - days * 86400_000);
  const roots = new Set(graph.get(type)!.filter(row => row.deletedAt && cutoff && row.deletedAt <= cutoff).map(row => keyOf(type, row.id)));
  const selected = selection(graph, roots, true);
  // A retained parent must never silently erase an active business record.
  const blocking = [...selected].filter(key => {
    const [model, id] = key.split(':');
    return !ancillary.has(model) && !graph.get(model)!.find(row => row.id === id)!.deletedAt;
  });
  const result = preview(graph, selected);
  const plan: RetentionPlan = { ...result, table: type, asOf: asOf.toISOString(), days, canPurge: blocking.length === 0, blockingCount: blocking.length,
    previewToken: createHash('sha256').update(JSON.stringify({ table: type, asOf: asOf.toISOString(), settingsVersion: settings.version, days, records: result.records, blocking })).digest('hex') };
  return { graph, selected, result: plan };
}
export async function purgeRetention(db: PrismaClient, input: { table: string; asOf: string; previewToken: string }, now = new Date()) {
  const asOf = new Date(input.asOf);
  if (asOf > now || now.getTime() - asOf.getTime() > 10 * 60_000) throw new AppError('STALE_PREVIEW', 409);
  return db.$transaction(async tx => {
    const plan = await retentionPreview(tx, input.table, asOf);
    if (plan.result.previewToken !== input.previewToken) throw new AppError('STALE_PREVIEW', 409);
    if (!plan.result.canPurge) throw new AppError('LINKED_RECORDS', 409);
    await removeSelected(tx, plan.graph, plan.selected);
    await logEvent(tx, { entityType: 'Owner', entityId: 'owner', action: 'purge', name: input.table, diffs: { table: input.table, counts: plan.result.counts, previewToken: input.previewToken } });
    return { ok: true, total: plan.result.total, counts: plan.result.counts };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
function deletionOrder(graph: Graph): string[] {
  const ordered: string[] = []; const visiting = new Set<string>();
  function visit(name: string) {
    if (ordered.includes(name)) return;
    if (visiting.has(name)) throw new Error('Cyclic foreign-key graph requires an explicit deletion strategy');
    visiting.add(name);
    for (const edge of graph.foreignKeys.filter(edge => edge.toType === name)) visit(edge.fromType);
    visiting.delete(name); ordered.push(name);
  }
  for (const model of models) visit(model.name);
  return ordered;
}
async function removeSelected(tx: Tx, graph: Graph, selected: Set<string>) {
  for (const type of deletionOrder(graph)) {
    const ids = graph.get(type)!.filter(row => selected.has(keyOf(type, row.id))).map(row => row.id);
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200).map(id => Prisma.sql`${id}::uuid`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${table(type)} WHERE "ownerId" = ${'owner'} AND "id" IN (${Prisma.join(batch)})`);
    }
  }
}
export async function examplePreview(tx: Tx) {
  const graph = await loadGraph(tx);
  const roots = new Set([...graph].flatMap(([type, rows]) => rows.filter(row => row.isExample).map(row => keyOf(type, row.id))));
  const selected = selection(graph, roots);
  return { graph, selected, result: preview(graph, selected) };
}
export async function cleanupExamples(db: PrismaClient, expected: string) {
  return db.$transaction(async tx => {
    const plan = await examplePreview(tx);
    if (plan.result.previewToken !== expected) throw new AppError('STALE_PREVIEW', 409);
    await removeSelected(tx, plan.graph, plan.selected);
    await logEvent(tx, { entityType: 'Owner', entityId: 'owner', action: 'purge', name: 'ÖRNEK', diffs: { counts: plan.result.counts } });
    return plan.result;
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
const ancillary = new Set(['Relation', 'Note', 'Attachment', 'Task', 'Notification', 'UpdateProposal', 'ShareLink', 'TrashEntry']);
export async function deletionPreview(tx: Tx, type: EntityType, id: string) {
  const graph = await loadGraph(tx);
  if (!graph.get(type)?.some(row => row.id === id)) throw new AppError('NOT_FOUND', 404);
  const selected = selection(graph, new Set([keyOf(type, id)]), true);
  const blocking = [...selected].filter(key => key !== keyOf(type, id) && !ancillary.has(key.split(':')[0]));
  return { graph, selected, result: { ...preview(graph, selected), canPurge: blocking.length === 0, blockingCount: blocking.length } };
}
export async function listTrash(db: PrismaClient) {
  const items = await db.trashEntry.findMany({ where: live, orderBy: { createdAt: 'desc' } });
  return Promise.all(items.map(async item => {
    const rows = await db.$queryRaw<{ version: number }[]>(Prisma.sql`SELECT "version" FROM ${table(item.entityType)} WHERE "id" = ${item.entityId}::uuid AND "ownerId" = ${'owner'} AND "deletedAt" IS NOT NULL`);
    return { ...item, recordVersion: rows[0]?.version ?? null };
  }));
}
export async function restoreTrash(db: PrismaClient, id: string, version: number, recordVersion: number) {
  return db.$transaction(async tx => {
    const item = await tx.trashEntry.findFirst({ where: { ...live, id } });
    if (!item) throw new AppError('NOT_FOUND', 404);
    if (item.version !== version) throw new AppError('STALE_VERSION', 409);
    const graph = await loadGraph(tx); const record = graph.get(item.entityType)?.find(row => row.id === item.entityId);
    if (!record || !record.deletedAt || record.version !== recordVersion) throw new AppError('STALE_VERSION', 409);
    for (const edge of graph.foreignKeys.filter(edge => edge.fromType === item.entityType)) if (record[edge.fromField] && !graph.get(edge.toType)?.some(row => row.id === record[edge.fromField] && !row.deletedAt)) throw new AppError('LINKED_RECORDS', 409);
    const changed = await tx.$executeRaw(Prisma.sql`UPDATE ${table(item.entityType)} SET "deletedAt" = NULL, "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${item.entityId}::uuid AND "ownerId" = ${'owner'} AND "version" = ${recordVersion} AND "deletedAt" IS NOT NULL`);
    if (changed !== 1 || (await tx.trashEntry.deleteMany({ where: { ...live, id, version } })).count !== 1) throw new AppError('STALE_VERSION', 409);
    await logEvent(tx, { entityType: item.entityType, entityId: item.entityId, action: 'restore', name: item.label, isExample: item.isExample });
    return { ok: true };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
export async function purgeTrash(db: PrismaClient, id: string, version: number, recordVersion: number, expected?: string) {
  return db.$transaction(async tx => {
    const item = await tx.trashEntry.findFirst({ where: { ...live, id } });
    if (!item) throw new AppError('NOT_FOUND', 404);
    if (item.version !== version) throw new AppError('STALE_VERSION', 409);
    const plan = await deletionPreview(tx, item.entityType as EntityType, item.entityId);
    const record = plan.graph.get(item.entityType)!.find(row => row.id === item.entityId)!;
    if (!record.deletedAt || record.version !== recordVersion || expected && expected !== plan.result.previewToken) throw new AppError('STALE_PREVIEW', 409);
    if (!plan.result.canPurge) throw new AppError('LINKED_RECORDS', 409);
    await removeSelected(tx, plan.graph, plan.selected);
    await logEvent(tx, { entityType: item.entityType, entityId: item.entityId, name: item.label, action: 'purge', isExample: item.isExample, diffs: { counts: plan.result.counts } });
    return { ok: true };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
