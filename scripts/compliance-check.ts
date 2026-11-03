import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
export const conclusionPhrases = ['is legal', 'is illegal', 'is compliant', 'legally valid', 'is permitted', 'hukuka uygundur', 'hukuka aykırıdır', 'geçerlidir', 'izin verilir', 'yasaldır'];
const entry = z.object({ id: z.string().min(1), text: z.object({ tr: z.string().min(1), en: z.string().min(1) }), appliesWhen: z.string().min(1), sourceUrl: z.string().url().optional(), tag: z.literal('owner-authored').optional(), version: z.string().min(1), reviewedAt: z.string().min(1) }).refine(v => !!(v.sourceUrl || v.tag));
export function checkRuleFile(value: unknown) {
  const file = z.object({ status: z.enum(['NOT REVIEWED', 'REVIEWED']), entries: z.array(entry).min(1) }).parse(value);
  for (const rule of file.entries) for (const phrase of conclusionPhrases) if (Object.values(rule.text).some(text => text.toLocaleLowerCase('tr').includes(phrase))) throw new Error(`Conclusion phrase in ${rule.id}`);
  if (file.status === 'REVIEWED' && file.entries.some(e => e.reviewedAt === 'NOT REVIEWED')) throw new Error('Review status conflicts');
  return file;
}
if (process.argv[1]?.endsWith('compliance-check.ts')) {
  for (const name of readdirSync('config/compliance').filter(n => n.endsWith('.json'))) {
    const result = checkRuleFile(JSON.parse(readFileSync(`config/compliance/${name}`, 'utf8')));
    console.log(`${name}: structure valid; ${result.status}`);
  }
}
