import { describe, expect, it } from 'vitest';
import { contractDatesInRange } from '../shared/agenda-overlays.js';
import { birthdayOccurrence } from '../shared/calendar.js';
import { contractDeadlineKinds, type ContractDates } from '../shared/player-contracts.js';

const sample = (changes: Partial<ContractDates> = {}): ContractDates => ({ startDate: '2026-01-01', endDate: '2026-12-31', isActive: true, paymentDay: 1, noticeDeadline: null, releaseClause: null, buyout: null, extensionOption: null, representation: null, ...changes });
describe('bounded agenda date layers', () => {
  it('covers all four intersecting months at the inclusive62-day boundary without notification thresholds', () => {
    const rows = contractDatesInRange(sample(), '2026-01-31', '2026-04-02');
    expect(rows.deadlines).toEqual(['2026-02-01', '2026-03-01', '2026-04-01'].map(date => ({ kind: 'PAYMENT_DAY', date, thresholds: [] })));
    expect(() => contractDatesInRange(sample(), '2026-01-31', '2026-04-03')).toThrow();
  });
  it('preserves all nine distinct same-day kinds and deduplicates the month wrapper', () => {
    const date = '2026-03-01'; const rows = contractDatesInRange(sample({ endDate: date, noticeDeadline: date, releaseClause: { validFrom: date, validTo: date, amount: '9000' }, buyout: { validFrom: date, validTo: date }, extensionOption: { deadline: date }, representation: { endDate: date } }), '2026-02-20', '2026-03-02');
    expect(rows.deadlines.map(row => row.kind).sort()).toEqual([...contractDeadlineKinds].sort()); expect(rows.deadlines.every(row => row.date === date)).toBe(true);
  });
  it('skips impossible monthly days visibly and respects contract start/end boundaries', () => {
    const rows = contractDatesInRange(sample({ startDate: '2026-01-31', endDate: '2026-03-31', paymentDay: 31 }), '2026-01-31', '2026-04-02');
    expect(rows.deadlines.filter(row => row.kind === 'PAYMENT_DAY').map(row => row.date)).toEqual(['2026-01-31', '2026-03-31']); expect(rows.skippedPaymentMonths).toEqual(['2026-02']);
    expect(contractDatesInRange(sample({ isActive: false }), '2026-01-31', '2026-04-02').deadlines).toEqual([]);
  });
  it('flags corrupt legacy dates/payment days without crashing every other contract', () => {
    expect(contractDatesInRange(sample({ paymentDay: 0 }), '2026-01-01', '2026-01-01')).toMatchObject({ deadlines: [], issues: [{ field: 'paymentDay', code: 'INVALID_PAYMENT_DAY' }] });
    expect(contractDatesInRange(sample({ paymentDay: 0 }), '2026-12-01', '2026-12-31')).toMatchObject({ deadlines: [{ kind: 'CONTRACT_END', date: '2026-12-31', thresholds: [] }], issues: [{ field: 'paymentDay', code: 'INVALID_PAYMENT_DAY' }] });
    expect(contractDatesInRange(sample({ startDate: '2026-02-30' }), '2026-01-01', '2026-01-01')).toMatchObject({ deadlines: [], issues: [{ field: 'startDate', code: 'INVALID_DATE' }] });
    expect(contractDatesInRange(sample({ startDate: '2027-01-01' }), '2026-01-01', '2026-01-01').issues).toEqual([{ field: 'endDate', code: 'DATE_ORDER' }]);
  });
  it('keeps month iteration finite at year9999 and pads early common-year leap-day fallback', () => {
    const row = sample({ startDate: '9999-12-01', endDate: '9999-12-31', paymentDay: 31 });
    expect(contractDatesInRange(row, '9999-12-31', '9999-12-31').deadlines.map(value => value.kind).sort()).toEqual(['CONTRACT_END', 'PAYMENT_DAY']);
    expect(birthdayOccurrence('02-29', 1)).toBe('0001-03-01'); expect(birthdayOccurrence('02-29', 4)).toBe('0004-02-29'); expect(birthdayOccurrence('02-29', 9999)).toBe('9999-03-01');
  });
});
