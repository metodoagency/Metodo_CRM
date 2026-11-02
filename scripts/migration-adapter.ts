import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 6's WASM migration engine selects PostgreSQL catalog `name` columns,
// while adapter-pg supports text. Cast only this internal metadata projection;
// never alter application values, migration scripts, checksums or verification.
export function catalogText(sql: string): string {
  return sql.replace('tbl.relname AS table_name, namespace.nspname AS table_namespace', 'tbl.relname::text AS table_name, namespace.nspname::text AS table_namespace');
}
export class MigrationPg extends PrismaPg {
  override async connect() {
    const connection = await super.connect();
    const query = connection.queryRaw.bind(connection);
    connection.queryRaw = input => query({ ...input, sql: catalogText(input.sql) });
    return connection;
  }
}
