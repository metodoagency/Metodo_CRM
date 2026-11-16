import { z } from 'zod';
export const maxFileBytes = 10 * 1024 * 1024;
export const fileMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const fileVersion = z.object({ version: z.number().int().positive() }).strict();
export const processingPreviewInput = z.object({ attachmentId: z.uuid(), attachmentVersion: z.number().int().positive(), adapterId: z.string().regex(/^[a-z0-9-]{1,60}$/), text: z.string().min(1).max(100000) }).strict();
export const processingApprovalInput = fileVersion.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/), approved: z.literal(true) });
export type AttachmentInfo = { id: string; name: string; mimeType: string; sizeBytes: number; version: number };
export type ProcessingAdapterInfo = { id: string; revision: string; location: 'local' | 'external'; destination: string };
export type ProcessingPreview = { id: string; version: number; previewToken: string; expiresAt: string; adapter: ProcessingAdapterInfo; payload: { attachmentId: string; documentHash: string; mimeType: string; text: string }; approved: boolean };
