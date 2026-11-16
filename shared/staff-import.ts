import { z } from 'zod';
import { manualSourceUrl } from './club-sources.js';
import { isoDate } from './domain.js';

export const staffRoles = ['HEAD_COACH', 'ASSISTANT', 'GOALKEEPER_COACH', 'YOUTH_COORDINATOR', 'OTHER'] as const;
export const staffCsvHeader = ['action', 'person', 'role', 'effectiveDate', 'sourceUrl'] as const;
export const staffCsvLimit = 64000;
export const staffImportInput = z.object({ csv: z.string().min(1).max(staffCsvLimit) }).strict();
export const staffImportApply = staffImportInput.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) });
export const tffEvidenceUrl = manualSourceUrl.refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && ['tff.org', 'www.tff.org'].includes(url.hostname) && !url.port && !url.hash;
}, 'TFF_SOURCE_REQUIRED');
export const staffCandidate = z.object({
  action: z.enum(['coach_appointment', 'coach_departure']), person: z.string().trim().min(1).max(160),
  role: z.enum(staffRoles), effectiveDate: isoDate, sourceUrl: tffEvidenceUrl,
}).strict();
export const importedStaff = z.object({ importKey: z.string().regex(/^[a-f0-9]{64}$/), candidate: staffCandidate });
export type StaffCandidate = z.infer<typeof staffCandidate>;
export type StaffImportPreview = {
  rows: (StaffCandidate & { line: number; duplicate: boolean })[];
  issues: { line: number; code: 'HEADER' | 'ROW' | 'LIMIT' }[];
  previewToken: string | null;
};
