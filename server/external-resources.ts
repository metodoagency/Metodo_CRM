import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError, live, logEvent, type Tx } from './core.js';
import { encrypt, decrypt } from './crypto.js';
import { requireFileParent } from './file-parent.js';
import { fileParentParams, idParams } from '../shared/contracts.js';
import { fileVersion } from '../shared/files.js';
import { normalizeSearch } from '../shared/domain.js';
import { retentionPeriods } from '../shared/retention.js';
import { deletionPreview } from './lifecycle.js';
import { requireExampleName } from './tasks.js';
import { resourceLinkParent, type ResourceConnections } from '../shared/external-resources.js';
import { externalResourceCreate, externalResourcePatch, externalResourceQuery, resourceLinkInput, resourceUnlinkInput, resourceLinkParams, resourceParentFields, resourceDeleteInput, type ResourceParent } from '../shared/external-resources.js';

const metadata = { id: true, name: true, kind: true, version: true, isExample: true } as const;
const parentWhere = (parent: ResourceParent) => ({ [resourceParentFields[parent.type]]: parent.id });
async function requireResource(tx: Tx, id: string, version?: number) {
  const row = await tx.externalResource.findFirst({ where: { ...live, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (version !== undefined && row.version !== version) throw new AppError('STALE_VERSION', 409);
  return row;
}
async function bump(tx: Tx, id: string, version: number) {
  const changed = await tx.externalResource.updateMany({ where: { ...live, id, version }, data: { version: { increment: 1 } } });
  if (changed.count !== 1) throw new AppError('STALE_VERSION', 409);
}
async function attach(tx: Tx, resource: { id: string; name: string; isExample: boolean }, parent: ResourceParent) {
  const target = await requireFileParent(tx, parent.type, parent.id);
  const prior = await tx.externalResourceLink.findFirst({ where: { ownerId: 'owner', resourceId: resource.id, ...parentWhere(parent) } });
  if (prior && !prior.deletedAt) throw new AppError('RESOURCE_ALREADY_LINKED', 409);
  const isExample = resource.isExample || target.isExample;
  const name = resource.isExample ? resource.name : target.isExample ? target.name : resource.name; requireExampleName(isExample, name);
  const data = { name, isExample, ...parentWhere(parent) };
  const link = prior
    ? await tx.externalResourceLink.update({ where: { id: prior.id, version: prior.version }, data: { deletedAt: null, version: { increment: 1 } } })
    : await tx.externalResourceLink.create({ data: { ...data, resourceId: resource.id } });
  if (prior) await tx.trashEntry.deleteMany({ where: { ownerId: 'owner', entityType: 'ExternalResourceLink', entityId: link.id } });
  await logEvent(tx, { entityType: parent.type, entityId: parent.id, action: 'update', name: target.name, isExample: link.isExample, diffs: { resourceId: resource.id, linkId: link.id, linked: true } });
  await logEvent(tx, { entityType: 'ExternalResource', entityId: resource.id, action: 'update', name: resource.name, isExample: link.isExample, diffs: { linkId: link.id, parent, linked: true } });
  return link;
}

export async function registerExternalResources(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/resources', async req => {
    const { page, q, kind } = externalResourceQuery.parse(req.query);
    const where: Prisma.ExternalResourceWhereInput = { ...live, ...(q ? { searchName: { contains: normalizeSearch(q) } } : {}), ...(kind ? { kind } : {}) };
    return db.$transaction(async tx => ({ page, pageSize: 50, total: await tx.externalResource.count({ where }),
      items: await tx.externalResource.findMany({ where, select: metadata, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 }) }), { isolationLevel: 'RepeatableRead' });
  });
  app.get('/api/records/:type/:id/resources', async req => {
    const parent = fileParentParams.parse(req.params); const { page } = externalResourceQuery.pick({ page: true }).parse(req.query);
    return db.$transaction(async tx => {
      await requireFileParent(tx, parent.type, parent.id);
      const where = { ...live, ...parentWhere(parent), resource: live };
      const total = await tx.externalResourceLink.count({ where });
      const links = await tx.externalResourceLink.findMany({ where, select: { id: true, version: true, resource: { select: metadata } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 });
      return { page, pageSize: 50, total, items: links.map(link => ({ ...link.resource, linkId: link.id, linkVersion: link.version })) };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/resources', async (req, reply) => {
    const input = externalResourceCreate.parse(req.body);
    const result = await db.$transaction(async tx => {
      const parent = input.parent ? await requireFileParent(tx, input.parent.type, input.parent.id) : null;
      requireExampleName(input.isExample || !!parent?.isExample, input.name);
      const row = await tx.externalResource.create({ data: { name: input.name, searchName: normalizeSearch(input.name), kind: input.kind,
        externalUrl: encrypt(input.externalUrl, 'ExternalResource.externalUrl'), isExample: input.isExample || !!parent?.isExample } });
      if (input.parent) await attach(tx, row, input.parent);
      await logEvent(tx, { entityType: 'ExternalResource', entityId: row.id, action: 'create', name: row.name, isExample: row.isExample, diffs: { kind: row.kind } });
      return tx.externalResource.findUniqueOrThrow({ where: { id: row.id }, select: metadata });
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(result);
  });
  app.patch('/api/resources/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, changes } = externalResourcePatch.parse(req.body);
    return db.$transaction(async tx => {
      const before = await requireResource(tx, id, version);
      if (changes.name !== undefined) requireExampleName(before.isExample, changes.name);
      const row = await tx.externalResource.update({ where: { id, version }, data: { ...changes,
        ...(changes.name === undefined ? {} : { searchName: normalizeSearch(changes.name) }),
        ...(changes.externalUrl === undefined ? {} : { externalUrl: encrypt(changes.externalUrl, 'ExternalResource.externalUrl') }), version: { increment: 1 } }, select: metadata });
      await logEvent(tx, { entityType: 'ExternalResource', entityId: id, action: 'update', name: row.name, isExample: row.isExample,
        diffs: { old: { name: before.name, kind: before.kind }, new: { name: row.name, kind: row.kind }, ...(changes.externalUrl === undefined ? {} : { externalUrl: '***' }) } });
      return row;
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/resources/:id/links', async (req, reply) => {
    const { id } = idParams.parse(req.params); const { version, parent } = resourceLinkInput.parse(req.body);
    const result = await db.$transaction(async tx => {
      const resource = await requireResource(tx, id, version); const link = await attach(tx, resource, parent); await bump(tx, id, version);
      return { id: resource.id, name: resource.name, kind: resource.kind, isExample: resource.isExample, version: version + 1, linkId: link.id, linkVersion: link.version };
    }, { isolationLevel: 'Serializable' });
    return reply.code(201).send(result);
  });
  app.get('/api/resources/:id/links', async req => {
    const { id } = idParams.parse(req.params); const { page } = externalResourceQuery.pick({ page: true }).parse(req.query);
    return db.$transaction(async tx => {
      await requireResource(tx, id); const where = { ...live, resourceId: id }; const total = await tx.externalResourceLink.count({ where });
      const links = await tx.externalResourceLink.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 });
      const items: ResourceConnections['items'] = [];
      for (const link of links) {
        const parent = resourceLinkParent(link); if (!parent) throw new AppError('INVALID_ENTITY');
        try {
          const target = await requireFileParent(tx, parent.type, parent.id);
          const href = parent.type === 'Contract' ? `/contracts/${parent.id}` : parent.type === 'Suggestion' && 'requestId' in target
            ? `/record/Request/${target.requestId}` : `/record/${parent.type}/${parent.id}`;
          items.push({ id: link.id, version: link.version, parent, label: target.name, href });
        } catch (error) {
          if (!(error instanceof AppError) || error.status !== 404) throw error;
          items.push({ id: link.id, version: link.version, parent, label: null, href: null });
        }
      }
      return { page, pageSize: 50, total, items };
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  });
  app.delete('/api/resources/:id/links/:linkId', async req => {
    const { id, linkId } = resourceLinkParams.parse(req.params); const { version, linkVersion } = resourceUnlinkInput.parse(req.body);
    return db.$transaction(async tx => {
      const resource = await requireResource(tx, id, version);
      const link = await tx.externalResourceLink.findFirst({ where: { ...live, id: linkId, resourceId: id } });
      if (!link) throw new AppError('NOT_FOUND', 404);
      if (link.version !== linkVersion) throw new AppError('STALE_VERSION', 409);
      await tx.externalResourceLink.update({ where: { id: linkId, version: linkVersion }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await bump(tx, id, version);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } }); const periods = retentionPeriods.parse(settings?.retentionDays ?? {});
      await tx.trashEntry.create({ data: { entityType: 'ExternalResourceLink', entityId: linkId, label: resource.name, isExample: link.isExample,
        expiresAt: new Date(Date.now() + (periods.ExternalResourceLink ?? 30) * 86400_000) } });
      await logEvent(tx, { entityType: 'ExternalResource', entityId: id, action: 'update', name: resource.name, isExample: resource.isExample, diffs: { linkId, linked: false } });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.get('/api/resources/:id/delete-preview', async req => {
    const { id } = idParams.parse(req.params);
    return db.$transaction(async tx => { const row = await requireResource(tx, id); return { ...(await deletionPreview(tx, 'ExternalResource', id)).result, version: row.version }; }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  });
  app.delete('/api/resources/:id', async req => {
    const { id } = idParams.parse(req.params); const { version, previewToken } = resourceDeleteInput.parse(req.body);
    return db.$transaction(async tx => {
      const resource = await requireResource(tx, id, version);
      if ((await deletionPreview(tx, 'ExternalResource', id)).result.previewToken !== previewToken) throw new AppError('STALE_PREVIEW', 409);
      const settings = await tx.userSettings.findUnique({ where: { ownerId: 'owner' } }); const periods = retentionPeriods.parse(settings?.retentionDays ?? {});
      await tx.externalResource.update({ where: { id, version }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await tx.trashEntry.create({ data: { entityType: 'ExternalResource', entityId: id, label: resource.name, isExample: resource.isExample,
        expiresAt: new Date(Date.now() + (periods.ExternalResource ?? 30) * 86400_000) } });
      await logEvent(tx, { entityType: 'ExternalResource', entityId: id, action: 'delete', name: resource.name, isExample: resource.isExample });
      return { ok: true };
    }, { isolationLevel: 'Serializable' });
  });
  app.post('/api/resources/:id/reveal', async req => {
    const expiresAt = Date.now() + 60_000; const { id } = idParams.parse(req.params); const { version } = fileVersion.parse(req.body);
    return db.$transaction(async tx => {
      const row = await requireResource(tx, id, version); const externalUrl = decrypt(row.externalUrl, 'ExternalResource.externalUrl');
      await logEvent(tx, { entityType: 'ExternalResource', entityId: id, action: 'reveal', name: 'ExternalResource', isExample: row.isExample, diffs: { field: 'externalUrl' } });
      if (Date.now() >= expiresAt) throw new AppError('STALE_VERSION', 409);
      return { externalUrl, expiresIn: 60, expiresAt: new Date(expiresAt).toISOString() };
    });
  });
}
