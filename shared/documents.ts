import { z } from 'zod';
export const documentMime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const;

export const documentInput = z.object({
  format: z.enum(['pdf', 'docx']),
  language: z.enum(['tr', 'en']),
  version: z.number().int().positive(),
}).strict();

export type DocumentInput = z.infer<typeof documentInput>;
export type DocumentContent = {
  language: DocumentInput['language'];
  title: string;
  subtitle: string;
  sections: { heading: string; lines: string[] }[];
  footer: string;
};
