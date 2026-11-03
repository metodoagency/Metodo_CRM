import { describe, expect, it } from 'vitest';
import { readConfig } from '../server/config.js';
import { readFileSync } from 'node:fs';
describe('environment validation', () => {
  it('accepts the complete local template including disabled optional features', () => {
    const template = Object.fromEntries(readFileSync('.env.example', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
    expect(readConfig(template).STORAGE_DRIVER).toBe('local');
  });
  it('rejects malformed flags, protocols, ports and optional feature configurations', () => {
    for (const env of [{ E2E_TEST_MODE: 'yes' }, { DATABASE_URL: 'https://example.com' }, { SMTP_PORT: '0' }, { AI_ENABLED: 'true' }, { IMAP_ENABLED: 'true' }, { STORAGE_DRIVER: 's3' }, { DATA_PROVIDER_ENABLED: 'true' }]) expect(() => readConfig(env)).toThrow('Invalid configuration');
  });
  it('reports missing production fields without disclosing supplied secrets', () => {
    expect(() => readConfig({ NODE_ENV: 'production', GOOGLE_CLIENT_SECRET: 'example-secret-never-log', DATABASE_URL: 'postgresql://owner:example-password@localhost/metodo' })).toThrow('GOOGLE_REDIRECT_URI');
    try { readConfig({ FIELD_ENCRYPTION_KEY: 'example-secret-never-log' }); } catch (error) { expect(String(error)).not.toContain('example-secret-never-log'); }
  });
  it('trusts no proxy by default and accepts only explicit proxy addresses', () => {
    expect(readConfig({}).TRUSTED_PROXY_CIDRS).toBe('');
    expect(readConfig({ TRUSTED_PROXY_CIDRS: '127.0.0.1,10.0.0.0/8,::1' }).TRUSTED_PROXY_CIDRS).toContain('10.0.0.0/8');
    for (const value of ['true', '*', '1', 'example.com', '10.0.0.0/33', '::1/129']) expect(() => readConfig({ TRUSTED_PROXY_CIDRS: value })).toThrow('TRUSTED_PROXY_CIDRS');
  });
});
