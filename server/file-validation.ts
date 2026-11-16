import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { fileMimes, maxFileBytes } from '../shared/files.js';
import { AppError } from './core.js';

export interface MalwareScanner { scan(data: Buffer): Promise<'clean' | 'infected'> }
export async function prepareFile(data: Buffer, claimedMime: string, scanner?: MalwareScanner) {
  if (data.length === 0) throw new AppError('INVALID_FILE');
  if (data.length > maxFileBytes) throw new AppError('FILE_TOO_LARGE', 413);
  if (!(fileMimes as readonly string[]).includes(claimedMime)) throw new AppError('INVALID_FILE_TYPE');
  let actual;
  try { actual = await fileTypeFromBuffer(data); } catch { throw new AppError('INVALID_FILE'); }
  if (!actual || actual.mime !== claimedMime) throw new AppError('FILE_TYPE_MISMATCH');
  if (scanner && await scanner.scan(data) !== 'clean') throw new AppError('FILE_REJECTED');
  let output = data; let mime = claimedMime;
  if (claimedMime.startsWith('image/')) {
    try {
      const image = sharp(data, { limitInputPixels: 40_000_000, animated: false, failOn: 'warning' });
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) !== 1) throw new Error('Animated images are not supported');
      output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      mime = 'image/webp';
    } catch { throw new AppError('INVALID_IMAGE'); }
  }
  if (output.length > maxFileBytes) throw new AppError('FILE_TOO_LARGE', 413);
  return { data: output, mime, sha256: createHash('sha256').update(output).digest('hex') };
}
export function originalFilename(value: string) {
  // Metadata only; never a filesystem path, S3 key, URL or response header.
  return [...value.replaceAll('\\', '/').split('/').pop()!].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 160) || 'attachment';
}
