import { z } from 'zod';

// Server validates these identifiers against the compiled Prisma model catalog.
export const tableName = z.string().regex(/^[A-Z][A-Za-z0-9]{0,63}$/);
export const retentionPeriods = z.record(tableName, z.number().int().min(1).max(3650));
export const retentionPreviewInput = z.object({ table: tableName }).strict();
export const retentionPurgeInput = retentionPreviewInput.extend({ asOf: z.iso.datetime(), previewToken: z.string().regex(/^[a-f0-9]{64}$/) });
export type RetentionCatalog = { version: number; periods: Record<string, number>; tables: { type: string; mode: 'softDeleted' | 'securityExpiry' | 'protected' }[]; automaticBusinessDeletion: false };
export type RetentionPlan = { table: string; asOf: string; days: number | null; total: number; counts: Record<string, number>; records: { type: string; id: string; version: number }[]; previewToken: string; canPurge: boolean; blockingCount: number };
export type SensitiveView = { id: string; actor: string; entityType: string; entityId: string; field: string; occurredAt: string };
