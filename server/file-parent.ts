import type { z } from 'zod';
import { fileParentParams } from '../shared/contracts.js';
import { AppError, live, requireEntity, type Tx } from './core.js';
import { requireContract } from './contract-parent.js';

export type FileParentType = z.infer<typeof fileParentParams.shape.type>;
export async function requireFileParent(tx: Tx, type: FileParentType, id: string) {
  if (type === 'Contract') return requireContract(tx, id);
  if (type !== 'Suggestion') return requireEntity(tx, type, id);
  const row = await tx.suggestion.findFirst({ where: { ...live, id, request: live, player: live, club: live, person: live }, select: { name: true, isExample: true, requestId: true } });
  if (!row) throw new AppError('NOT_FOUND', 404);
  return row;
}
