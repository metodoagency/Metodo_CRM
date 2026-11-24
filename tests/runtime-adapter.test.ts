import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { RuntimePg, isCommitWriteConflict } from '../server/runtime-adapter.js';

describe('security baseline: transaction commit conflicts', () => {
  it('rolls back a commit-time serialization failure and returns both connections to the pool', async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/metodo_test') throw new Error('Unsafe test database');
    const pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    const connection = await new RuntimePg(pool, { disposeExternalPool: true }).connect();
    const sql = (text: string) => ({ sql: text, args: [], argTypes: [] });
    try {
      await connection.executeRaw(sql('CREATE TABLE "RuntimeConflictFixture" (id integer PRIMARY KEY, value integer NOT NULL)'));
      await connection.executeRaw(sql('INSERT INTO "RuntimeConflictFixture" VALUES (1, 0), (2, 0)'));
      const first = await connection.startTransaction('SERIALIZABLE');
      const second = await connection.startTransaction('SERIALIZABLE');
      try {
        await first.queryRaw(sql('SELECT value FROM "RuntimeConflictFixture" ORDER BY id'));
        await second.queryRaw(sql('SELECT value FROM "RuntimeConflictFixture" ORDER BY id'));
        await first.executeRaw(sql('UPDATE "RuntimeConflictFixture" SET value = 1 WHERE id = 1'));
        await second.executeRaw(sql('UPDATE "RuntimeConflictFixture" SET value = 2 WHERE id = 2'));
        await first.executeRaw(sql('COMMIT')); await first.commit();
        const error = await second.executeRaw(sql('COMMIT')).then(() => undefined, (cause: unknown) => cause);
        expect(isCommitWriteConflict(error)).toBe(true);
        expect(pool.waitingCount).toBe(0);
        expect(pool.idleCount).toBe(2);
        expect(pool.totalCount).toBe(2);
        expect((await connection.queryRaw(sql('SELECT id, value FROM "RuntimeConflictFixture" ORDER BY id'))).rows).toEqual([[1, 1], [2, 0]]);
      } finally {
        // These calls are idempotent even after the failed boundary released it.
        await first.rollback(); await second.rollback();
      }
    } finally {
      await connection.executeRaw(sql('DROP TABLE IF EXISTS "RuntimeConflictFixture"'));
      await connection.dispose();
    }
  });

  it('does not classify uncertain commits or unrelated database errors as safe conflicts', () => {
    for (const cause of [{ kind: 'TransactionWriteConflict', originalCode: '08006' }, { kind: 'GenericJs', originalCode: '40001' }, null]) {
      const error = new Error('Example failure', { cause }); error.name = 'DriverAdapterError';
      expect(isCommitWriteConflict(error)).toBe(false);
    }
    expect(isCommitWriteConflict({ name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict', originalCode: '40001' } })).toBe(false);
  });
});
