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
    // adapter-pg 6.19 splits scripts at every semicolon, including DO bodies.
    // Let PostgreSQL parse the trusted migration as one simple-query batch;
    // quoted semicolons survive and a failed batch rolls back atomically.
    connection.executeScript = async script => { await connection.executeRaw({ sql: script, args: [], argTypes: [] }); };
    return connection;
  }
}
