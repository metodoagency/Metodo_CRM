import 'dotenv/config';
import { z } from 'zod';
export function readConfig(env = process.env) {
  const config = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url().default('postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo'),
    APP_ORIGIN: z.string().url().refine(value => new URL(value).origin === value, 'APP_ORIGIN must be an exact origin without a trailing slash or path').default('http://localhost:5173'),
    ALLOWED_EMAILS: z.string().default(''),
    E2E_TEST_MODE: z.string().default('false'),
    GOOGLE_CLIENT_ID: z.string().default(''), GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_REDIRECT_URI: z.string().default(''),
    FIELD_ENCRYPTION_KEY: z.string().optional(), BLIND_INDEX_KEY: z.string().optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000), HOST: z.string().min(1).default('0.0.0.0'),
  }).parse(env);
  if (config.NODE_ENV === 'production' && (!config.APP_ORIGIN.startsWith('https://') || !config.ALLOWED_EMAILS.trim())) throw new Error('Production requires HTTPS APP_ORIGIN and ALLOWED_EMAILS');
  if (config.NODE_ENV === 'production' && (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.FIELD_ENCRYPTION_KEY || !config.BLIND_INDEX_KEY)) throw new Error('Missing production variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FIELD_ENCRYPTION_KEY, BLIND_INDEX_KEY');
  if (config.ALLOWED_EMAILS.split(',').map(v => v.trim()).filter(Boolean).some(value => !z.email().safeParse(value).success)) throw new Error('ALLOWED_EMAILS contains an invalid email');
  return { ...config, allowedEmails: config.ALLOWED_EMAILS.split(',').map(v => v.trim().toLowerCase()).filter(Boolean), testAuth: config.NODE_ENV !== 'production' && (config.NODE_ENV === 'test' || config.E2E_TEST_MODE === 'true') };
}
export type Config = ReturnType<typeof readConfig>;
