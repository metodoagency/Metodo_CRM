import { z } from 'zod';
export const privacyNoticeVersion = '2026-11-03.1';
export const acknowledgePrivacy = z.object({ version: z.number().int().positive(), noticeVersion: z.literal(privacyNoticeVersion), language: z.enum(['tr', 'en']) }).strict();
export const incidentContactInput = z.object({ version: z.number().int().positive(), value: z.string().trim().max(320) }).strict();
export type PrivacyState = { noticeVersion: string; acceptedVersion: string | null; acknowledgedAt: string | null; acknowledgementRequired: boolean; version: number; contactConfigured: boolean };
