import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { MigrationPg } from './scripts/migration-adapter';
export default defineConfig({
  schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' },
  experimental: { adapter: true }, engine: 'js',
  adapter: async () => new MigrationPg({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo' }),
});
