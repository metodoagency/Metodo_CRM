import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { agendaQuery } from '../shared/meetings.js';
import { contractDatesInRange, type AgendaDateWarning, type AgendaDeadline } from '../shared/agenda-overlays.js';
import { istanbulToday, normalizeSearch } from '../shared/domain.js';
import { birthdayRangeCandidates, birthdayTransaction, calendarPageSize, sensitiveViewSeconds } from './birthdays.js';
import { contractScope } from './contract-parent.js';

export async function registerAgendaOverlays(app: FastifyInstance, db: PrismaClient) {
  app.get('/api/agenda/deadlines', async req => {
    const { from, to, q, page } = agendaQuery.parse(req.query);
    return db.$transaction(async tx => {
      const rows = await tx.contract.findMany({ where: { ...contractScope, isActive: true }, select: {
        id: true, name: true, startDate: true, endDate: true, isActive: true, paymentDay: true, noticeDeadline: true,
        releaseClause: true, buyout: true, extensionOption: true, representation: true,
      } });
      const items: AgendaDeadline[] = []; const warnings: AgendaDateWarning[] = [];
      for (const row of rows.filter(row => normalizeSearch(row.name).includes(normalizeSearch(q)))) {
        const result = contractDatesInRange({ ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10), noticeDeadline: row.noticeDeadline?.toISOString().slice(0, 10) ?? null }, from, to);
        const label = { contractId: row.id, name: row.name };
        items.push(...result.deadlines.map(value => ({ ...label, kind: value.kind, date: value.date })));
        warnings.push(...result.skippedPaymentMonths.map(month => ({ ...label, code: 'SKIPPED_PAYMENT' as const, month })), ...result.issues.map(value => ({ ...label, ...value })));
      }
      items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.contractId.localeCompare(b.contractId));
      warnings.sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.contractId.localeCompare(b.contractId) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const start = (page - 1) * calendarPageSize;
      return { items: items.slice(start, start + calendarPageSize), total: items.length, warnings: warnings.slice(start, start + calendarPageSize), warningTotal: warnings.length, page, pageSize: calendarPageSize };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/agenda/birthdays/view', async req => {
    const { from, to, q, page } = agendaQuery.parse(req.body);
    const started = Date.now();
    return birthdayTransaction(db, async tx => {
      const rows = (await birthdayRangeCandidates(tx, from, to, istanbulToday())).filter(row => normalizeSearch(row.name).includes(normalizeSearch(q)));
      rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'tr') || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
      const selected = rows.slice((page - 1) * calendarPageSize, page * calendarPageSize);
      if (selected.length) await tx.auditLog.createMany({ data: selected.map(row => ({ actor: 'owner', action: 'reveal', entityType: row.kind, entityId: row.id, isExample: row.isExample, diffs: { field: 'birthDate' } })) });
      return { items: selected.map(({ isExample: _example, ...row }) => row), total: rows.length, page, pageSize: calendarPageSize, expiresIn: sensitiveViewSeconds, expiresAt: new Date(started + sensitiveViewSeconds * 1000).toISOString() };
    });
  });
}
