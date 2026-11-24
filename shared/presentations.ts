import { z } from 'zod';
import { presentationChannels } from './domain.js';
import { taskDate } from './tasks.js';
import type { NamedRecord } from './transfer-requests.js';

export const presentationResults = ['PENDING', 'INTERESTED', 'OFFERED', 'REJECTED', 'WAITING'] as const;
export const presentationFields = z.object({
  date: taskDate, channel: z.enum(presentationChannels), result: z.enum(presentationResults),
  followUpDate: taskDate, note: z.string().trim().max(4000),
}).strict();
export const presentationCreate = presentationFields.extend({
  clubId: z.uuid(), personId: z.uuid(), playerId: z.uuid(), requestId: z.uuid().nullable().default(null),
});
export const presentationUpdate = presentationFields.extend({ version: z.number().int().positive() });
const page = z.coerce.number().int().min(1).max(100000).default(1);
export const presentationQuery = z.object({
  page, clubId: z.uuid().optional(), personId: z.uuid().optional(), playerId: z.uuid().optional(),
  overdue: z.enum(['true', 'false']).default('false'),
}).strict();
export const matrixQuery = z.object({
  axis: z.enum(['Club', 'Person']).default('Club'), rowPage: page, playerPage: page,
  q: z.string().trim().max(100).default(''), playerQ: z.string().trim().max(100).default(''),
}).strict();
export type PresentationInfo = z.infer<typeof presentationFields> & {
  id: string; version: number; club: NamedRecord; person: NamedRecord; player: NamedRecord; request: NamedRecord | null;
};
export type MatrixInfo = {
  rows: NamedRecord[]; players: NamedRecord[]; rowsMore: boolean; playersMore: boolean;
  cells: { id: string; version: number; targetId: string; playerId: string; result: typeof presentationResults[number]; date: string }[];
};
