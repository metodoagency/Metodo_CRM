import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from './config.js';
import type { Tx } from './core.js';
import { AppError } from './core.js';
import { maxFileBytes } from '../shared/files.js';

export interface FileStorage {
  driver: 'local' | 's3';
  put(key: string, data: Buffer, mime: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedDownload?(key: string): Promise<string>;
}
export const newStorageKey = () => randomBytes(32).toString('hex');
export function checkStorageKey(key: string) { if (!/^[a-f0-9]{64}$/.test(key)) throw new AppError('INVALID_FILE_KEY'); return key; }
export class LocalFileStorage implements FileStorage {
  readonly driver = 'local' as const;
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
    for (const folder of ['public', 'dist', 'src']) if (this.root === resolve(folder) || this.root.startsWith(resolve(folder) + sep)) throw new Error('Storage must be outside served/source directories');
  }
  private path(key: string) { return resolve(this.root, checkStorageKey(key)); }
  async put(key: string, data: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const handle = await open(this.path(key), 'wx', 0o600);
    try { await handle.writeFile(data); } finally { await handle.close(); }
  }
  async read(key: string) { return readFile(this.path(key)); }
  async remove(key: string) { try { await unlink(this.path(key)); } catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw e; } }
}
export class S3FileStorage implements FileStorage {
  readonly driver = 's3' as const;
  private client: S3Client;
  constructor(config: Pick<Config, 'S3_ENDPOINT' | 'S3_REGION' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_BUCKET'>) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION, forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY } });
  }
  private bucket: string;
  async put(key: string, data: Buffer, mime: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: checkStorageKey(key), Body: data, ContentType: mime,
      ContentDisposition: 'attachment; filename="attachment"', CacheControl: 'private, no-store' }), { abortSignal: AbortSignal.timeout(30000) });
  }
  async read(key: string) {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: checkStorageKey(key) }), { abortSignal: AbortSignal.timeout(30000) });
    if (!object.Body || (object.ContentLength ?? 0) > maxFileBytes) throw new AppError('INVALID_FILE');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) { size += chunk.length; if (size > maxFileBytes) throw new AppError('FILE_TOO_LARGE', 413); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  }
  async remove(key: string) { await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: checkStorageKey(key) }), { abortSignal: AbortSignal.timeout(30000) }); }
  async signedDownload(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: checkStorageKey(key) }), { expiresIn: 300 });
  }
}
export function createStorage(config: Config): FileStorage | undefined {
  if (config.STORAGE_DRIVER === 's3') return new S3FileStorage(config);
  // A free host's transient filesystem must never become production storage.
  return config.NODE_ENV === 'production' ? undefined : new LocalFileStorage(config.STORAGE_PATH);
}
export async function drainStorageDeletions(db: Tx, storage: FileStorage, now = new Date()) {
  const jobs = await db.storageDeletion.findMany({ where: { ownerId: 'owner', driver: storage.driver, notBefore: { lte: now } }, take: 25, orderBy: { createdAt: 'asc' } });
  let removed = 0;
  for (const job of jobs) {
    // Never delete an object still referenced by a live or trashed attachment.
    if (await db.attachment.count({ where: { ownerId: 'owner', storageKey: job.storageKey } })) continue;
    try { await storage.remove(job.storageKey); const done = await db.storageDeletion.deleteMany({ where: { id: job.id, ownerId: 'owner' } }); removed += done.count; }
    catch { await db.storageDeletion.updateMany({ where: { id: job.id, ownerId: 'owner' }, data: { attempts: { increment: 1 }, notBefore: new Date(now.getTime() + 3600_000) } }); }
  }
  return { removed, pending: await db.storageDeletion.count({ where: { ownerId: 'owner' } }) };
}
