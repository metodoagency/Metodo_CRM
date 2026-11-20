import { agendaExport } from './meetings.js';
import { contractDeadlines, type ContractDates, type ContractDeadline } from './player-contracts.js';
import type { BirthdayKind } from './calendar.js';
import { isoDate } from './domain.js';
type ContractRangeIssue = { field: string; code: 'DATE_ORDER' | 'INVALID_DATE' | 'INVALID_PAYMENT_DAY' };

export function contractDatesInRange(input: ContractDates, from: string, to: string) {
  agendaExport.parse({ from, to });
  const invalid: ContractRangeIssue[] = [];
  for (const field of ['startDate', 'endDate'] as const) if (!isoDate.safeParse(input[field]).success) invalid.push({ field, code: 'INVALID_DATE' });
  if (invalid.length) return { deadlines: [], skippedPaymentMonths: [], issues: invalid };
  const months: string[] = [];
  const absolute = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
  for (let month = absolute(from); month <= absolute(to); month++) months.push(`${String(Math.floor(month / 12)).padStart(4, '0')}-${String(month % 12 + 1).padStart(2, '0')}`);
  const dates = new Map<string, ContractDeadline>(); const skipped = new Set<string>();
  const issues = new Map<string, ContractRangeIssue>();
  for (const month of months) {
    const result = contractDeadlines(input, `${month}-01`, []);
    for (const row of result.deadlines) if (row.date >= from && row.date <= to) dates.set(`${row.kind}:${row.date}`, row);
    for (const value of result.skippedPaymentMonths) if (months.includes(value)) skipped.add(value);
    for (const value of result.issues) issues.set(`${value.field}:${value.code}`, value);
  }
  return { deadlines: [...dates.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)), skippedPaymentMonths: [...skipped].sort(), issues: [...issues.values()] };
}
export type AgendaDeadline = { contractId: string; name: string; kind: ContractDeadline['kind']; date: string };
export type AgendaDateWarning = { contractId: string; name: string } & ({ code: 'SKIPPED_PAYMENT'; month: string } | ContractRangeIssue);
export type AgendaDeadlines = { items: AgendaDeadline[]; total: number; warnings: AgendaDateWarning[]; warningTotal: number; page: number; pageSize: number };
export type AgendaBirthday = { id: string; kind: BirthdayKind; name: string; date: string };
export type AgendaBirthdays = { items: AgendaBirthday[]; total: number; page: number; pageSize: number; expiresIn: number; expiresAt: string };
