import { describe, expect, it } from 'vitest';
import { contractDeadlines, contractInput, contractThresholds, defaultContractThresholds, type ContractDates } from '../shared/player-contracts.js';
import { istanbulToday } from '../shared/domain.js';

const input = {
  name: 'Örnek Sözleşme', type: 'EMPLOYMENT', clubId: null, agentId: null, signedDate: null,
  startDate: '2026-01-01', endDate: '2027-01-01', isActive: true,
  salaryAmount: '9007199254740991.99', salaryCurrency: 'EUR', salaryPeriod: 'YEAR', salaryBasis: 'GROSS',
  bonuses: null, paymentDay: null, releaseClause: null, buyout: null, extensionOption: null, noticeDeadline: null, representation: null,
  documentLink: null, sourceUrl: 'https://example.com/contract', sourceDate: '2026-01-01', methodNote: 'Örnek elle kayıt',
};
const dates: ContractDates = { ...input };
describe('manual contract validation', () => {
  it('preserves decimal strings and requires provenance and salary context', () => {
    expect(contractInput.parse(input).salaryAmount).toBe(input.salaryAmount);
    for (const changes of [
      { salaryAmount: 100 }, { salaryAmount: '1e3' }, { salaryCurrency: null }, { salaryBasis: null }, { salaryPeriod: null },
      { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'https://user:secret@example.com' }, { methodNote: '' },
      { endDate: '2025-01-01' }, { sourceDate: '2026-02-29' }, { paymentDay: 0 },
      { clubId: '0d6d5d27-a28f-4142-a913-409871a391b1', agentId: '0d6d5d27-a28f-4142-a913-409871a391b2' },
    ]) expect(contractInput.safeParse({ ...input, ...changes }).success).toBe(false);
    expect(contractInput.safeParse({ ...input, salaryAmount: null, salaryCurrency: null, salaryBasis: null, salaryPeriod: null }).success).toBe(true);
    expect(contractThresholds.safeParse([30, 30]).success).toBe(false);
  });

  it('rejects reversed clause windows and representation dates without making legal judgments', () => {
    const clause = { amount: '123.45', currency: 'TRY', validFrom: '2026-06-01', validTo: '2026-05-01', conditions: 'Örnek koşul', met: 'UNKNOWN' };
    expect(contractInput.safeParse({ ...input, releaseClause: clause }).success).toBe(false);
    expect(contractInput.safeParse({ ...input, buyout: { ...clause, validTo: null, currency: null } }).success).toBe(false);
    const representation = { scope: 'Örnek kapsam', startDate: '2026-02-01', endDate: '2026-01-01', commissionRate: '10.00', paymentTerms: '' };
    expect(contractInput.safeParse({ ...input, representation }).success).toBe(false);
    expect(contractInput.safeParse({ ...input, representation: { ...representation, endDate: null, commissionRate: '100.01' } }).success).toBe(false);
  });
});

describe('contract deadline calendar', () => {
  it('extracts all nine deadline kinds and catches up only reached thresholds', () => {
    const date = '2026-06-30';
    const view = contractDeadlines({ ...dates, endDate: date, paymentDay: 30, noticeDeadline: date,
      releaseClause: { validFrom: date, validTo: date }, buyout: { validFrom: date, validTo: date },
      extensionOption: { deadline: date }, representation: { endDate: date },
    }, '2026-06-01', defaultContractThresholds);
    expect(view.deadlines).toHaveLength(9);
    expect(new Set(view.deadlines.map(item => item.kind)).size).toBe(9);
    expect(view.deadlines.every(item => item.date === date && item.thresholds.join() === '180,90,30')).toBe(true);
    expect(contractDeadlines(dates, '2026-01-01', [90, 30]).deadlines[0].thresholds).toEqual([]);
  });

  it('uses the supplied Istanbul date and never generates reminders for past or inactive records', () => {
    const today = istanbulToday(new Date('2026-06-30T21:00:00Z'));
    expect(today).toBe('2026-07-01');
    expect(contractDeadlines({ ...dates, endDate: '2026-06-30' }, today, [30]).deadlines).toEqual([]);
    expect(contractDeadlines({ ...dates, isActive: false, paymentDay: 1 }, today, [180]).deadlines).toEqual([]);
    expect(contractDeadlines({ ...dates, endDate: today }, today, [0]).deadlines).toEqual([{ kind: 'CONTRACT_END', date: today, thresholds: [0] }]);
  });

  it('skips impossible monthly payment days, supports leap years and respects the contract interval', () => {
    const record = { ...dates, startDate: '2024-02-01', endDate: '2024-03-31', paymentDay: 31 };
    const result = contractDeadlines(record, '2024-02-01', [90]);
    expect(result.skippedPaymentMonths).toEqual(['2024-02']);
    expect(result.deadlines.filter(item => item.kind === 'PAYMENT_DAY').map(item => item.date)).toEqual(['2024-03-31']);
    expect(contractDeadlines({ ...record, paymentDay: 29 }, '2024-02-01', [30]).deadlines.some(item => item.date === '2024-02-29')).toBe(true);
    expect(contractDeadlines({ ...record, startDate: '2025-02-01', endDate: '2025-02-28', paymentDay: 29 }, '2025-02-01', [30]).skippedPaymentMonths).toEqual(['2025-02']);
  });

  it('does not invent dates for legacy or malformed JSON terms', () => {
    const result = contractDeadlines({ ...dates, releaseClause: { amount: '1000' }, buyout: { validFrom: '2026-02-30' }, extensionOption: 'Örnek eski metin' }, '2026-01-01', [180]);
    expect(result.deadlines.map(item => item.kind)).toEqual(['CONTRACT_END']);
  });

  it('flags reversed legacy intervals instead of treating their dates as normal deadlines', () => {
    expect(contractDeadlines({ ...dates, startDate: '2028-01-01' }, '2026-01-01', [180])).toMatchObject({ deadlines: [], issues: [{ field: 'endDate', code: 'DATE_ORDER' }] });
    const reversed = { validFrom: '2026-06-01', validTo: '2026-05-01' };
    const result = contractDeadlines({ ...dates, releaseClause: reversed, buyout: reversed, representation: { startDate: '2026-06-01', endDate: '2026-05-01' } }, '2026-01-01', [180]);
    expect(result.deadlines.map(item => item.kind)).toEqual(['CONTRACT_END']);
    expect(result.issues.map(item => item.field)).toEqual(['releaseClause', 'buyout', 'representation']);
  });

  it('ends monthly iteration within the supported four-digit calendar and contract end month', () => {
    const result = contractDeadlines({ ...dates, startDate: '9999-01-01', endDate: '9999-12-31', paymentDay: 31 }, '9999-12-01', [365]);
    expect(result.skippedPaymentMonths).toEqual([]);
    expect(result.deadlines).toEqual([
      { kind: 'CONTRACT_END', date: '9999-12-31', thresholds: [365] },
      { kind: 'PAYMENT_DAY', date: '9999-12-31', thresholds: [365] },
    ]);
  });
});
