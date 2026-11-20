import { taskLink, type TaskLink } from '../shared/tasks.js';
import { AppError, live, type Tx } from './core.js';
import { contractScope } from './contract-parent.js';
import { presentationLive } from './presentations.js';

const select = { id: true, name: true } as const;
// Explicit dispatch prevents the generic entity delegate's Request fallback.
export async function taskLinkRecords(tx: Tx, type: TaskLink['type'], id?: string) {
  const where = { ...live, ...(id ? { id } : {}) };
  const options = { select, orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }] };
  switch (type) {
    case 'Club': return tx.club.findMany({ ...options, where });
    case 'Player': return tx.player.findMany({ ...options, where });
    case 'Person': return tx.person.findMany({ ...options, where });
    case 'Request': return tx.request.findMany({ ...options, where: { ...where, club: live, OR: [{ requesterId: null }, { requester: live }] } });
    case 'Contract': return tx.contract.findMany({ ...options, where: { ...contractScope, ...where } });
    case 'Meeting': return tx.meeting.findMany({ ...options, where });
    case 'Presentation': return tx.presentation.findMany({ ...options, where: { ...presentationLive, ...where } });
    case 'Agent': return tx.agent.findMany({ ...options, where });
    case 'SignificantDate': return tx.significantDate.findMany({ ...options, where });
    case 'Suggestion': return tx.suggestion.findMany({ ...options, where: { ...where, request: live, player: live, club: live, person: live } });
    case 'UpdateProposal': {
      // Current proposal workflows support Club targets only. Later adapters
      // must add their own canonical-parent guard before widening this scope.
      const clubs = await tx.club.findMany({ where: live, select: { id: true } });
      return tx.updateProposal.findMany({ ...options, where: { ...where, targetType: 'Club', targetId: { in: clubs.map(row => row.id) } } });
    }
  }
}
export async function resolveTaskLink(tx: Tx, type: string | null, id: string | null) {
  if (!type && !id) return null;
  const parsed = taskLink.safeParse({ type, id });
  if (!parsed.success) return null;
  const row = (await taskLinkRecords(tx, parsed.data.type, parsed.data.id))[0];
  return row ? { ...parsed.data, name: row.name } : null;
}
export async function requireTaskLink(tx: Tx, type: string | null, id: string | null) {
  if (type === null && id === null) return null;
  const row = await resolveTaskLink(tx, type, id);
  if (!row) throw new AppError('TASK_LINK_UNAVAILABLE', 409);
  return row;
}
