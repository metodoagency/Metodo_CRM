export type RecordType = 'Club' | 'Player' | 'Person' | 'Request';
export type RecordRow = { id: string; name: string; city?: string; status?: string; primaryPosition?: string; role?: string; relationStatus?: string; currentClub?: RecordRow | null; club?: RecordRow; clubId?: string; requesterId?: string; birthDate?: string; isExample: boolean; version: number; createdAt: string; sourceUrl?: string; verificationStatus: string };
export type List = { items: RecordRow[]; total: number; page: number };
export type Timeline = { id: string; summaryTr: string; summaryEn: string; createdAt: string; entityType: string; entityId: string };
export type Overview = { clubs: number; players: number; requests: number; proposals: number; notifications: number; tasks: { id: string; name: string; dueDate: string; priority: string }[]; meetings: { id: string; name: string; date: string; time: string; locationOrUrl: string }[]; recent: Timeline[] };
