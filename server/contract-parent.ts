import type { Prisma } from '@prisma/client';
import { AppError, live, type Tx } from './core.js';

export const contractScope: Prisma.ContractWhereInput = {
  ...live, player: live,
  AND: [{ OR: [{ clubId: null }, { club: live }] }, { OR: [{ agentId: null }, { agent: live }] }],
};
export async function requireContract(tx: Tx, id: string) {
  const row = await tx.contract.findFirst({ where: { ...contractScope, id } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
