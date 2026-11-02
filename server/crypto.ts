import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

const keySchema = z.string().refine(v => /^[A-Za-z0-9+/]{43}=$/.test(v) && Buffer.from(v, 'base64').length === 32, 'Key must be 32 bytes in base64');
export type Keyring = { active: string; keys: Record<string, string>; blind: string };
let cached: Keyring | undefined;
export function keyring(): Keyring {
  if (cached) return cached;
  if (process.env.FIELD_ENCRYPTION_KEY && process.env.BLIND_INDEX_KEY) {
    const active = process.env.FIELD_ENCRYPTION_KEY_ID || 'primary';
    const encryption = keySchema.parse(process.env.FIELD_ENCRYPTION_KEY);
    const blind = keySchema.parse(process.env.BLIND_INDEX_KEY);
    if (encryption === blind) throw new Error('Encryption and blind-index keys must differ');
    const previous = z.record(z.string(), keySchema).parse(JSON.parse(process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS || '{}'));
    cached = { active, keys: { ...previous, [active]: encryption }, blind };
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Production encryption keys are required');
    const path = process.env.NODE_ENV === 'test' ? '.local/test-keys.json' : '.local/dev-keys.json';
    if (!existsSync(path)) {
      mkdirSync('.local', { recursive: true, mode: 0o700 });
      writeFileSync(path, JSON.stringify({ active: 'dev', keys: { dev: randomBytes(32).toString('base64') }, blind: randomBytes(32).toString('base64') }), { mode: 0o600, flag: 'wx' });
    }
    cached = z.object({ active: z.string(), keys: z.record(z.string(), keySchema), blind: keySchema }).parse(JSON.parse(readFileSync(path, 'utf8')));
  }
  return cached;
}
export function encrypt(plaintext: string, context: string, ring = keyring()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(ring.keys[ring.active], 'base64'), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', ring.active, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decrypt(ciphertext: string, context: string, ring = keyring()): string {
  const [version, id, iv, tag, data] = ciphertext.split('.');
  if (version !== 'v1' || !ring.keys[id] || !iv || !tag || data === undefined) throw new Error('Invalid encrypted field or unknown key id');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(ring.keys[id], 'base64'), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8');
}
export function blindIndex(value: string, ring = keyring()): string {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('tr');
  return createHmac('sha256', Buffer.from(ring.blind, 'base64')).update(normalized).digest('hex');
}
export function csrfToken(sessionToken: string, ring = keyring()): string {
  return createHmac('sha256', Buffer.from(ring.blind, 'base64')).update(`csrf:${sessionToken}`).digest('base64url');
}
export function verifyCsrf(session: string, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(csrfToken(session)); const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const encryptedFields: Record<string, readonly string[]> = {
  Owner: ['email'], Session: ['email'], Person: ['birthDate', 'phone', 'email'],
  Player: ['birthDate', 'phone', 'email', 'healthNotes', 'injuryNotes'], Guardian: ['phone', 'email'],
  MedicalRecord: ['summary'], Contract: ['salaryAmount', 'bonuses'], Mandate: ['commissionTerms'],
};
