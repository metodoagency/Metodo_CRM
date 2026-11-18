import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 6's JS transaction manager skips adapter cleanup when COMMIT fails.
// In particular, PostgreSQL may reject a serializable transaction at COMMIT,
// after its last application query succeeded. Always release that connection.
export class RuntimePg extends PrismaPg {
  override async connect() {
    const connection = await super.connect();
    const start = connection.startTransaction.bind(connection);
    connection.startTransaction = async isolationLevel => {
      const transaction = await start(isolationLevel);
      const execute = transaction.executeRaw.bind(transaction);
      const commit = transaction.commit.bind(transaction);
      const rollback = transaction.rollback.bind(transaction);
      let released = false;
      transaction.commit = async () => { if (!released) { released = true; await commit(); } };
      transaction.rollback = async () => { if (!released) { released = true; await rollback(); } };
      transaction.executeRaw = async query => {
        try { return await execute(query); }
        catch (error) {
          if (['COMMIT', 'ROLLBACK'].includes(query.sql.trim().toUpperCase())) {
            // A failed COMMIT may already have rolled back. An explicit rollback
            // also makes other failed boundaries safe for the next pool user.
            try { await execute({ sql: 'ROLLBACK', args: [], argTypes: [] }); }
            catch { /* Preserve the original failure, including uncertain commits. */ }
            finally { await transaction.rollback(); }
          }
          throw error;
        }
      };
      return transaction;
    };
    return connection;
  }
}

export function isCommitWriteConflict(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError') return false;
  const cause = error.cause;
  return typeof cause === 'object' && cause !== null &&
    'kind' in cause && cause.kind === 'TransactionWriteConflict' &&
    'originalCode' in cause && cause.originalCode === '40001';
}
