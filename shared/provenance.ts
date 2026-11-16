import { z } from 'zod';

export const sourceTypes = ['OFFICIAL', 'TFF', 'MEDIA', 'SOCIAL', 'MANUAL', 'AI_EXTRACTED', 'DATA_PROVIDER', 'KAP', 'DOCUMENT'] as const;
export const manualSourceUrl = z.url({ protocol: /^https?$/ }).max(2048).refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password;
}, 'INVALID_SOURCE');
export const fieldSource = z.object({
  sourceUrl: z.url().nullable(), sourceType: z.enum(sourceTypes),
  retrievedAt: z.iso.datetime({ offset: true }),
  verificationStatus: z.enum(['VERIFIED', 'PARTIAL', 'UNVERIFIED']),
}).strict().superRefine((value, ctx) => {
  if ((value.sourceType !== 'MANUAL' || value.verificationStatus === 'VERIFIED') && !value.sourceUrl) ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'SOURCE_REQUIRED' });
  if (value.sourceUrl && !['https:', 'http:'].includes(new URL(value.sourceUrl).protocol)) ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'INVALID_SOURCE' });
});
export type FieldSource = z.infer<typeof fieldSource>;
const unapprovedSource = fieldSource
  .refine(source => source.verificationStatus !== 'VERIFIED', 'APPROVAL_REQUIRED')
  .refine(source => source.sourceUrl === null || manualSourceUrl.safeParse(source.sourceUrl).success, { path: ['sourceUrl'], message: 'INVALID_SOURCE' });
export function withProvenance<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, fieldProvenance: z.record(z.string(), unapprovedSource).optional() }).strict();
}
// A manual edit resets that field's evidence unless the owner supplies new
// provenance. Unchanged fields retain their original sources.
export function provenanceFor(input: Record<string, unknown>, previous: unknown = {}, now = new Date()): Record<string, FieldSource> {
  const sources = z.record(z.string(), fieldSource).parse(input.fieldProvenance ?? {});
  for (const key of Object.keys(sources)) if (key === 'fieldProvenance' || !(key in input) || input[key] === undefined) throw new z.ZodError([{ code: 'custom', path: ['fieldProvenance', key], message: 'PROVENANCE_WITHOUT_VALUE' }]);
  const result: Record<string, FieldSource> = { ...z.record(z.string(), fieldSource).parse(previous ?? {}) };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'fieldProvenance' || value === undefined) continue;
    result[key] = sources[key] ?? { sourceUrl: null, sourceType: 'MANUAL', retrievedAt: now.toISOString(), verificationStatus: 'UNVERIFIED' };
  }
  return result;
}
