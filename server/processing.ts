import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient, ProcessingConsent } from '@prisma/client';
import { idParams } from '../shared/contracts.js';
import { fileVersion, processingApprovalInput, processingPreviewInput, type ProcessingAdapterInfo, type ProcessingPreview } from '../shared/files.js';
import { AppError, live, logEvent, type Tx } from './core.js';
import { decrypt, encrypt } from './crypto.js';
import { requireAttachment } from './files.js';
import type { Config } from './config.js';
import { tr, en } from '../shared/locales.js';

export interface DocumentProcessor extends ProcessingAdapterInfo {
  // Only the previewed text payload is supplied; no raw files or database handle.
  process(payload: Readonly<ProcessingPreview['payload']>): Promise<unknown>;
}
const descriptor = (a: DocumentProcessor): ProcessingAdapterInfo => ({ id: a.id, revision: a.revision, location: a.location, destination: a.destination });
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function processingLog(tx: Tx, input: Parameters<typeof logEvent>[1]) {
  const key = `timeline_${input.action}` as keyof typeof tr;
  return logEvent(tx, { ...input, summaries: { tr: (tr[key] || tr.timeline_update).replace('{name}', tr.fileProcessing), en: (en[key] || en.timeline_update).replace('{name}', en.fileProcessing) } });
}
export class DocumentProcessing {
  constructor(private db: PrismaClient, private config: Config, private adapters: readonly DocumentProcessor[]) {
    if (new Set(adapters.map(a => a.id)).size !== adapters.length) throw new Error('Duplicate processing adapter');
    for (const a of adapters) if (!/^[a-z0-9-]{1,60}$/.test(a.id) || !a.revision || (a.location === 'external' ? !a.destination.startsWith('https://') : a.destination !== 'local')) throw new Error('Invalid processing descriptor');
  }
  available() { return this.adapters.filter(a => a.location === 'local' || this.config.EXTERNAL_PROCESSING_ENABLED === 'true').map(descriptor); }
  private adapter(id: string) {
    const a = this.adapters.find(a => a.id === id);
    if (!a || a.location === 'external' && this.config.EXTERNAL_PROCESSING_ENABLED !== 'true') throw new AppError('PROCESSING_UNAVAILABLE', 503);
    return a;
  }
  private async checked(tx: Tx, id: string, now = new Date()) {
    const row = await tx.processingConsent.findFirst({ where: { ...live, id } });
    if (!row) throw new AppError('NOT_FOUND', 404);
    if (row.expiresAt <= now || row.consumedAt) throw new AppError('STALE_PREVIEW', 409);
    const file = await requireAttachment(tx, row.attachmentId); const a = this.adapter(row.adapterId);
    const payload = JSON.parse(decrypt(row.processingPayload, 'ProcessingConsent.processingPayload')) as ProcessingPreview['payload'];
    if (file.version !== row.attachmentVersion || file.contentHash !== payload.documentHash || fingerprint(descriptor(a)) !== fingerprint({ id: row.adapterId, revision: row.adapterRevision, location: row.adapterLocation, destination: row.destination })) throw new AppError('STALE_PREVIEW', 409);
    const token = fingerprint({ id, attachmentVersion: row.attachmentVersion, adapter: descriptor(a), payload, expiresAt: row.expiresAt.toISOString() });
    if (token !== row.previewToken) throw new AppError('STALE_PREVIEW', 409);
    return { row, payload, adapter: a };
  }
  private view(row: ProcessingConsent, payload: ProcessingPreview['payload'], adapter: DocumentProcessor): ProcessingPreview {
    return { id: row.id, version: row.version, previewToken: row.previewToken, expiresAt: row.expiresAt.toISOString(), adapter: descriptor(adapter), payload, approved: !!row.approvedAt };
  }
  async preview(input: unknown) {
    const data = processingPreviewInput.parse(input); const a = this.adapter(data.adapterId);
    return this.db.$transaction(async tx => {
      const file = await requireAttachment(tx, data.attachmentId);
      if (file.version !== data.attachmentVersion || !file.contentHash) throw new AppError('STALE_VERSION', 409);
      const id = randomUUID(); const expiresAt = new Date(Date.now() + 600000);
      const payload = { attachmentId: file.id, documentHash: file.contentHash, mimeType: file.mimeType, text: data.text };
      const previewToken = fingerprint({ id, attachmentVersion: file.version, adapter: descriptor(a), payload, expiresAt: expiresAt.toISOString() });
      const row = await tx.processingConsent.create({ data: { id, attachmentId: file.id, attachmentVersion: file.version, adapterId: a.id, adapterRevision: a.revision, adapterLocation: a.location, destination: a.destination,
        processingPayload: encrypt(JSON.stringify(payload), 'ProcessingConsent.processingPayload'), expiresAt, previewToken, isExample: file.isExample, sourceType: 'DOCUMENT' } });
      await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'create', name: 'ProcessingConsent', diffs: { attachmentId: file.id, adapterId: a.id }, isExample: file.isExample });
      await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'reveal', name: 'ProcessingConsent', diffs: { field: 'processingPayload' }, isExample: file.isExample });
      return this.view(row, payload, a);
    });
  }
  async read(id: string) {
    return this.db.$transaction(async tx => {
      const { row, payload, adapter } = await this.checked(tx, id);
      await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'reveal', name: 'ProcessingConsent', diffs: { field: 'processingPayload' }, isExample: row.isExample });
      return this.view(row, payload, adapter);
    });
  }
  async approve(id: string, input: unknown) {
    const data = processingApprovalInput.parse(input);
    return this.db.$transaction(async tx => {
      const { row } = await this.checked(tx, id);
      if (row.version !== data.version || row.previewToken !== data.previewToken || row.approvedAt) throw new AppError('STALE_PREVIEW', 409);
      const changed = await tx.processingConsent.updateMany({ where: { ...live, id, version: data.version, approvedAt: null, consumedAt: null }, data: { approvedAt: new Date(), status: 'APPROVED', version: { increment: 1 } } });
      if (!changed.count) throw new AppError('STALE_PREVIEW', 409);
      await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'approve', name: 'ProcessingConsent', diffs: { adapterId: row.adapterId, attachmentId: row.attachmentId }, isExample: row.isExample });
      return { id, version: row.version + 1 };
    }, { isolationLevel: 'Serializable' });
  }
  async run(id: string, input: unknown) {
    const data = fileVersion.parse(input);
    const claimed = await this.db.$transaction(async tx => {
      const item = await this.checked(tx, id);
      if (!item.row.approvedAt || item.row.status !== 'APPROVED') throw new AppError('CONSENT_REQUIRED', 403);
      if (item.row.version !== data.version) throw new AppError('STALE_VERSION', 409);
      const changed = await tx.processingConsent.updateMany({ where: { ...live, id, version: data.version, consumedAt: null, status: 'APPROVED' }, data: { consumedAt: new Date(), status: 'RUNNING', version: { increment: 1 } } });
      if (!changed.count) throw new AppError('STALE_PREVIEW', 409);
      await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'update', name: 'ProcessingConsent', diffs: { status: 'RUNNING' }, isExample: item.row.isExample });
      return item;
    }, { isolationLevel: 'Serializable' });
    try {
      // Consume before invocation: failed or repeated processing needs new consent.
      const result = JSON.stringify(await claimed.adapter.process(Object.freeze(claimed.payload)));
      if (result === undefined || result.length > 200000) throw new Error('Invalid processing output');
      await this.db.$transaction(async tx => {
        await tx.processingConsent.update({ where: { id }, data: { processingResult: encrypt(result, 'ProcessingConsent.processingResult'), status: 'DONE', version: { increment: 1 } } });
        await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'update', name: 'ProcessingConsent', diffs: { status: 'DONE' }, isExample: claimed.row.isExample });
      });
      return { id, status: 'DONE' };
    } catch {
      await this.db.$transaction(async tx => {
        const changed = await tx.processingConsent.updateMany({ where: { ...live, id, status: 'RUNNING' }, data: { status: 'FAILED', version: { increment: 1 } } });
        if (changed.count) await processingLog(tx, { entityType: 'ProcessingConsent', entityId: id, action: 'update', name: 'ProcessingConsent', diffs: { status: 'FAILED' }, isExample: claimed.row.isExample });
      });
      throw new AppError('PROCESSING_FAILED', 503);
    }
  }
}
export async function registerProcessing(app: FastifyInstance, db: PrismaClient, config: Config, adapters: readonly DocumentProcessor[] = []) {
  const processing = new DocumentProcessing(db, config, adapters);
  app.get('/api/processing/adapters', async () => processing.available());
  app.post('/api/processing/preview', async (req, reply) => reply.code(201).send(await processing.preview(req.body)));
  app.get('/api/processing/:id', async req => processing.read(idParams.parse(req.params).id));
  app.post('/api/processing/:id/approve', async req => processing.approve(idParams.parse(req.params).id, req.body));
  app.post('/api/processing/:id/run', async req => processing.run(idParams.parse(req.params).id, req.body));
}
