import { describe, it, expect } from 'vitest';
import { ageOn, isoDate, istanbulToday, maskSensitive, normalizeSearch, sensitiveKeys } from '../shared/domain.js';
import { tr, en } from '../shared/locales.js';
import { encrypt, decrypt, blindIndex, csrfToken, verifyCsrf, type Keyring } from '../server/crypto.js';
import { randomBytes } from 'node:crypto';
import { catalogText } from '../scripts/migration-adapter.js';
import { createLogger } from '../server/logging.js';

describe('Turkish normalization', () => {
  it.each([['Şahin', 'Sahin'], ['ISTANBUL', 'İstanbul'], ['Özel', 'Ozel'], ['ÇĞİIÖŞÜçğıiöşü', 'CGIIOSUcgii osu'.replaceAll(' ', '')]])('%s matches %s', (a, b) => expect(normalizeSearch(a)).toBe(normalizeSearch(b)));
});
describe('calendar accuracy', () => {
  it.each(['2025-02-29', '2026-13-01', '2026-04-31', '02.11.2026'])('rejects %s', v => expect(isoDate.safeParse(v).success).toBe(false));
  it('accepts a leap date', () => expect(isoDate.parse('2024-02-29')).toBe('2024-02-29'));
  it('uses Istanbul around midnight', () => expect(istanbulToday(new Date('2026-11-01T21:30:00Z'))).toBe('2026-11-02'));
  it('turns 18 on the local birthday', () => { expect(ageOn('2008-11-02', '2026-11-01')).toBe(17); expect(ageOn('2008-11-02', '2026-11-02')).toBe(18); });
});
describe('localization', () => {
  it('has identical keys and no empty translations', () => { expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort()); for (const v of [...Object.values(tr), ...Object.values(en)]) expect(v.length).toBeGreaterThan(0); });
});
describe('encryption', () => {
  const ring: Keyring = { active: 'one', keys: { one: randomBytes(32).toString('base64') }, blind: randomBytes(32).toString('base64') };
  it('uses authenticated encryption with a fresh IV and no plaintext', () => {
    const a = encrypt('private@example.com', 'Person.email', ring); const b = encrypt('private@example.com', 'Person.email', ring);
    expect(a).not.toBe(b); expect(a).not.toContain('private'); expect(decrypt(a, 'Person.email', ring)).toBe('private@example.com');
  });
  it('rejects tampering, a different field and an unknown key', () => {
    const value = encrypt('sensitive', 'Player.healthNotes', ring);
    expect(() => decrypt(value, 'Person.email', ring)).toThrow();
    expect(() => decrypt(value.replace('.one.', '.two.'), 'Player.healthNotes', ring)).toThrow();
    const parts = value.split('.'); parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => decrypt(parts.join('.'), 'Player.healthNotes', ring)).toThrow();
  });
  it('reads old keys and re-encrypts with the active key', () => {
    const old = encrypt('old value', 'Person.phone', ring);
    const rotated = { ...ring, active: 'two', keys: { ...ring.keys, two: randomBytes(32).toString('base64') } };
    const next = encrypt(decrypt(old, 'Person.phone', rotated), 'Person.phone', rotated);
    expect(next.split('.')[1]).toBe('two'); expect(decrypt(next, 'Person.phone', rotated)).toBe('old value');
  });
  it('builds deterministic keyed blind indexes', () => { expect(blindIndex(' NAME@EXAMPLE.COM ', ring)).toBe(blindIndex('name@example.com', ring)); expect(blindIndex('name@example.com', ring)).not.toBe('name@example.com'); });
  it('binds CSRF to the session', () => { const a = csrfToken('session-a'); expect(verifyCsrf('session-a', a)).toBe(true); expect(verifyCsrf('session-b', a)).toBe(false); expect(verifyCsrf('session-a', '')).toBe(false); });
});
describe('sensitive paths', () => {
  it('masks all configured sensitive fields recursively', () => {
    const fields = Object.fromEntries([...sensitiveKeys].map(k => [k, 'secret']));
    const masked = maskSensitive({ old: fields, new: [fields] });
    expect(JSON.stringify(masked)).not.toContain('secret'); expect(JSON.stringify(masked)).toContain('***');
  });
  it('redacts structured request logs', () => {
    let output = '';
    const logger = createLogger({ write: chunk => { output += chunk; } });
    logger.info({ req: { method: 'POST', url: '/api/players?email=secret', headers: { cookie: 'session-secret' }, body: { healthNotes: 'medical-secret' } }, email: 'private@example.com', guardian: { phone: 'guardian-secret' }, contract: { salaryAmount: 'salary-secret' } });
    for (const value of ['secret', 'private@example.com']) expect(output).not.toContain(value);
    expect(JSON.parse(output).level).toBe(30);
  });
});
describe('migration adapter', () => {
  it('casts only catalog-name projections', () => { expect(catalogText('SELECT tbl.relname AS table_name, namespace.nspname AS table_namespace FROM pg_class')).toContain('relname::text'); expect(catalogText('SELECT name FROM "Player"')).toBe('SELECT name FROM "Player"'); });
});
