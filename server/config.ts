import 'dotenv/config';
import { z } from 'zod';
import { isIP } from 'node:net';

const emptyOptional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === '' ? undefined : value, schema.optional());
const flag = z.enum(['true', 'false']).default('false');
const key = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'Must be a 32-byte base64 key');
const databaseUrl = z.url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), 'Must be a PostgreSQL URL');
const httpUrl = z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol), 'Must be an HTTP(S) URL');
const proxyAddresses = z.string().default('').refine(value => value.split(',').map(part => part.trim()).filter(Boolean).every(part => {
  const [address, prefix, extra] = part.split('/'); const family = isIP(address);
  return family !== 0 && extra === undefined && (prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128)));
}), 'Must contain only explicit proxy IP addresses or CIDRs');
const configuration = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: databaseUrl.default('postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo'),
  DIRECT_URL: emptyOptional(databaseUrl),
  APP_ORIGIN: httpUrl.refine(value => new URL(value).origin === value, 'Must be an exact origin without path or trailing slash').default('http://localhost:5173'),
  ALLOWED_EMAILS: z.string().default(''), E2E_TEST_MODE: flag,
  GOOGLE_CLIENT_ID: z.string().default(''), GOOGLE_CLIENT_SECRET: z.string().default(''), GOOGLE_REDIRECT_URI: emptyOptional(httpUrl),
  FIELD_ENCRYPTION_KEY: emptyOptional(key), BLIND_INDEX_KEY: emptyOptional(key),
  FIELD_ENCRYPTION_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).default('primary'),
  FIELD_ENCRYPTION_PREVIOUS_KEYS: z.string().default('{}').superRefine((value, ctx) => {
    try { z.record(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), key).parse(JSON.parse(value)); }
    catch { ctx.addIssue({ code: 'custom', message: 'Must be a JSON object of key IDs to 32-byte base64 keys' }); }
  }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000), HOST: z.string().min(1).default('0.0.0.0'),
  TRUSTED_PROXY_CIDRS: proxyAddresses,
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'), STORAGE_PATH: z.string().min(1).default('.local/uploads'),
  S3_ENDPOINT: emptyOptional(httpUrl), S3_BUCKET: z.string().default(''), S3_REGION: z.string().default(''),
  S3_ACCESS_KEY_ID: z.string().default(''), S3_SECRET_ACCESS_KEY: z.string().default(''),
  AI_ENABLED: flag, AI_PROVIDER: z.enum(['', 'gemini', 'openai']).default(''),
  GEMINI_API_KEY: z.string().default(''), OPENAI_API_KEY: z.string().default(''), GOOGLE_SHEETS_ENABLED: flag,
  SMTP_ENABLED: flag, SMTP_HOST: z.string().default(''), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(''), SMTP_PASSWORD: z.string().default(''), SMTP_FROM: emptyOptional(z.email()),
  PLAYWRIGHT_EXECUTABLE_PATH: z.string().default(''), CLAMAV_ENABLED: flag, TCMB_ENABLED: flag,
  IMAP_ENABLED: flag, IMAP_HOST: z.string().default(''), IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(993),
  IMAP_USER: z.string().default(''), IMAP_PASSWORD: z.string().default(''),
  DATA_PROVIDER_ENABLED: flag, DATA_PROVIDER_API_KEY: z.string().default(''), DATA_PROVIDER_LICENSE_NOTE: z.string().default(''),
}).superRefine((config, ctx) => {
  const requireFields = (fields: (keyof typeof config)[]) => {
    for (const field of fields) if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required for the enabled feature' });
  };
  if (config.ALLOWED_EMAILS.split(',').map(value => value.trim()).filter(Boolean).some(value => !z.email().safeParse(value).success)) ctx.addIssue({ code: 'custom', path: ['ALLOWED_EMAILS'], message: 'Contains an invalid email address' });
  if (config.FIELD_ENCRYPTION_KEY && config.FIELD_ENCRYPTION_KEY === config.BLIND_INDEX_KEY) ctx.addIssue({ code: 'custom', path: ['BLIND_INDEX_KEY'], message: 'Must differ from the field encryption key' });
  if (Boolean(config.FIELD_ENCRYPTION_KEY) !== Boolean(config.BLIND_INDEX_KEY)) requireFields(['FIELD_ENCRYPTION_KEY', 'BLIND_INDEX_KEY']);
  if (config.NODE_ENV === 'production') {
    requireFields(['DIRECT_URL', 'ALLOWED_EMAILS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'FIELD_ENCRYPTION_KEY', 'BLIND_INDEX_KEY']);
    if (!config.APP_ORIGIN.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'HTTPS required in production' });
    if (config.GOOGLE_REDIRECT_URI !== `${config.APP_ORIGIN}/auth/google/callback`) ctx.addIssue({ code: 'custom', path: ['GOOGLE_REDIRECT_URI'], message: 'Must match the application callback URL' });
  }
  if (config.STORAGE_DRIVER === 's3') requireFields(['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']);
  if (config.AI_ENABLED === 'true') requireFields(config.AI_PROVIDER === 'openai' ? ['AI_PROVIDER', 'OPENAI_API_KEY'] : ['AI_PROVIDER', 'GEMINI_API_KEY']);
  if (config.SMTP_ENABLED === 'true') requireFields(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']);
  if (config.IMAP_ENABLED === 'true') requireFields(['IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD']);
  if (config.DATA_PROVIDER_ENABLED === 'true') requireFields(['DATA_PROVIDER_API_KEY', 'DATA_PROVIDER_LICENSE_NOTE']);
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = configuration.safeParse(env);
  // Never include raw environment input (passwords, keys or database URLs).
  if (!parsed.success) throw new Error('Invalid configuration: ' + parsed.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join('; '));
  const config = parsed.data;
  if (config.NODE_ENV === 'production' && (!env.DATABASE_URL || new URL(config.DATABASE_URL).password === 'metodo_local_only')) throw new Error('Invalid configuration: DATABASE_URL (explicit production database required)');
  return { ...config, GOOGLE_REDIRECT_URI: config.GOOGLE_REDIRECT_URI ?? `${config.APP_ORIGIN}/auth/google/callback`, allowedEmails: config.ALLOWED_EMAILS.split(',').map(value => value.trim().toLowerCase()).filter(Boolean), testAuth: config.NODE_ENV !== 'production' && (config.NODE_ENV === 'test' || config.E2E_TEST_MODE === 'true') };
}
export type Config = ReturnType<typeof readConfig>;
