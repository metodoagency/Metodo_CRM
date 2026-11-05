import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { idParams } from '../shared/contracts.js';
import { staffCandidate, staffCsvHeader, staffImportApply, staffImportInput, type StaffImportPreview } from '../shared/staff-import.js';
import { AppError, live, logEvent, requireEntity, type Tx } from './core.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function splitLine(line: string, delimiter: string) {
  const cell = delimiter === ',' ? /(?:"((?:[^"]|"")*)"|([^",]*))(?:,|$)/y : /(?:"((?:[^"]|"")*)"|([^";]*))(?:;|$)/y;
  const values = [];
  for (let index = 0; index <= line.length;) {
    cell.lastIndex = index;
    const match = cell.exec(line);
    if (!match) return null;
    values.push(match[1]?.replaceAll('""', '"') ?? match[2]);
    if (!match[0].endsWith(delimiter) || match[0] === '') break;
    index = cell.lastIndex;
  }
  return values;
}

function parseStaffCsv(csv: string) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift();
  const delimiter = header === staffCsvHeader.join(';') ? ';' : ',';
  const issues: StaffImportPreview['issues'] = [];
  const rows: { candidate: ReturnType<typeof staffCandidate.parse>; line: number; key: string }[] = [];
  if (header !== staffCsvHeader.join(delimiter)) return { rows, issues: [{ line: 1, code: 'HEADER' as const }] };
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const lineNumber = index + 2;
    if (rows.length + issues.length === 50) { issues.push({ line: lineNumber, code: 'LIMIT' }); break; }
    const values = splitLine(line, delimiter);
    const parsed = values?.length === staffCsvHeader.length ? staffCandidate.safeParse(Object.fromEntries(staffCsvHeader.map((key, i) => [key, values[i]]))) : null;
    if (!parsed?.success) { issues.push({ line: lineNumber, code: 'ROW' }); continue; }
    rows.push({ candidate: parsed.data, line: lineNumber, key: hash(parsed.data) });
  }
  return { rows, issues };
}

async function planImport(tx: Tx, clubId: string, csv: string) {
  const club = await requireEntity(tx, 'Club', clubId);
  const { rows, issues } = parseStaffCsv(csv);
  const keys = new Set(rows.map(row => row.key));
  const previous = keys.size ? await tx.updateProposal.findMany({
    where: { ownerId: live.ownerId, targetType: 'Club', targetId: clubId,
      OR: [...keys].map(key => ({ payload: { path: ['importKey'], equals: key } })) }, select: { payload: true },
  }) : [];
  const used = new Set(previous.flatMap(row => typeof row.payload === 'object' && row.payload && 'importKey' in row.payload ? [row.payload.importKey] : []));
  const planned = rows.map(row => {
    const duplicate = used.has(row.key);
    used.add(row.key);
    return { ...row, duplicate };
  });
  const preview: StaffImportPreview = {
    rows: planned.map(row => ({ ...row.candidate, line: row.line, duplicate: row.duplicate })), issues,
    previewToken: issues.length || !planned.some(row => !row.duplicate) ? null : hash({ clubId, version: club.version, planned }),
  };
  return { club, planned, preview };
}

export async function registerStaffImport(app: FastifyInstance, db: PrismaClient) {
  app.post('/api/clubs/:id/staff-import/preview', async req => {
    const { id } = idParams.parse(req.params);
    const { csv } = staffImportInput.parse(req.body);
    return db.$transaction(async tx => (await planImport(tx, id, csv)).preview, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/clubs/:id/staff-import/apply', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { csv, previewToken } = staffImportApply.parse(req.body);
    const result = await db.$transaction(async tx => {
      const { club, planned, preview } = await planImport(tx, id, csv);
      if (preview.previewToken !== previewToken) throw new AppError('PREVIEW_STALE', 409);
      const batchId = randomUUID();
      const ids = [];
      for (const { candidate, key, duplicate } of planned) {
        if (duplicate) continue;
        const isExample = club.isExample;
        const name = isExample && !/^örnek/iu.test(candidate.person) ? `Örnek · ${candidate.person}` : candidate.person;
        const proposal = await tx.updateProposal.create({ data: {
          name, summary: '', type: candidate.action, targetType: 'Club', targetId: club.id, isExample,
          date: new Date(`${candidate.effectiveDate}T00:00:00Z`), sourceType: 'TFF', sourceUrl: candidate.sourceUrl,
          payload: { importKey: key, candidate },
        }, select: { id: true } });
        ids.push(proposal.id);
        await logEvent(tx, { entityType: 'UpdateProposal', entityId: proposal.id, action: 'create', name, batchId, isExample });
      }
      return { ids };
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    return reply.code(201).send(result);
  });
}
