import { describe, expect, it } from 'vitest';
import { istanbulToday } from '../shared/domain.js';
import { defaultMatchingSettings, matchCriteria, matchingSettings, scoreTransferMatch, type MatchPlayer, type MatchRequest } from '../shared/transfer-matching.js';

const today = '2026-11-17';
const money = { amount: '1000.00', currency: 'EUR' } as const;
const request: MatchRequest = {
  position: 'CM', ageMin: 24, ageMax: 25, preferredFoot: 'LEFT', euRequired: true, salaryBudget: money, feeBudget: money,
};
const settings = { ...defaultMatchingSettings, levelMinimum: 7 };
const player: MatchPlayer = {
  primaryPosition: 'CM', birthDate: '2001-11-17', preferredFoot: 'BOTH', euPassport: true, annualGrossSalary: money,
  askingFee: { amount: '0', currency: 'EUR' }, levelScore: 7, contractEndDate: '2027-05-17',
};

describe('transfer matching R7', () => {
  it('scores all eight criteria when comparable and fitting', () => {
    const result = scoreTransferMatch(request, player, today, settings);
    expect(result).toEqual({ score: 100, coverage: 100, criteria: matchCriteria.map(criterion => ({ criterion, points: 2, reason: 'full' })) });
  });

  it('marks missing evidence independently for all eight criteria', () => {
    const result = scoreTransferMatch(request, {}, today, settings);
    expect(result).toEqual({ score: null, coverage: 0, criteria: matchCriteria.map(criterion => ({ criterion, points: null, reason: 'missing' })) });
  });

  it('keeps known mismatches and counts a long contract as a zero-point availability blocker', () => {
    const result = scoreTransferMatch(request, {
      ...player, primaryPosition: 'GK', birthDate: '2001-11-18', preferredFoot: 'RIGHT', euPassport: false,
      annualGrossSalary: { ...money, amount: '1000.01' }, askingFee: { ...money, amount: '1000.01' },
      levelScore: 6.5, contractEndDate: '2027-11-18',
    }, today, settings);
    expect(result.score).toBe(13);
    expect(result.coverage).toBe(100);
    expect(result.criteria).toContainEqual({ criterion: 'age', points: 2, reason: 'full' });
    expect(result.criteria).toContainEqual({ criterion: 'passport', points: 0, reason: 'mismatch' });
    expect(result.criteria).toContainEqual({ criterion: 'availability', points: 0, reason: 'lateContract' });
  });

  it('normalizes out missing weights and does not include disabled and unrequested criteria', () => {
    const result = scoreTransferMatch({ position: 'CM', preferredFoot: 'RIGHT', euRequired: false }, { primaryPosition: 'CB', secondaryPositions: ['CM'] }, today,
      { ...defaultMatchingSettings, weights: { ...defaultMatchingSettings.weights, position: 3, foot: 1, availability: 0 } });
    expect(result).toEqual({ score: 50, coverage: 75, criteria: [
      { criterion: 'position', points: 1, reason: 'partial' }, { criterion: 'foot', points: null, reason: 'missing' },
    ] });
  });

  it('keeps salary and fees independent, distinguishes zero, and compares 18-digit decimals exactly', () => {
    const result = scoreTransferMatch({
      position: 'CM', salaryBudget: { amount: '0.00', currency: 'TRY' }, feeBudget: { amount: '9999999999999999.01', currency: 'EUR' },
    }, {
      primaryPosition: 'CM', annualGrossSalary: { amount: '0', currency: 'TRY' },
      askingFee: { amount: '9999999999999999.02', currency: 'EUR' },
    }, today);
    expect(result.criteria).toContainEqual({ criterion: 'salary', points: 2, reason: 'full' });
    expect(result.criteria).toContainEqual({ criterion: 'fee', points: 0, reason: 'mismatch' });
    expect(result).toMatchObject({ score: 67, coverage: 75 });
  });

  it('excludes incomparable currencies and invalid amounts', () => {
    const result = scoreTransferMatch(request, { ...player, annualGrossSalary: { ...money, currency: 'USD' }, askingFee: { ...money, amount: '1e3' } }, today, settings);
    expect(result.criteria).toContainEqual({ criterion: 'salary', points: null, reason: 'currency' });
    expect(result.criteria).toContainEqual({ criterion: 'fee', points: null, reason: 'missing' });
    expect(result).toMatchObject({ score: 100, coverage: 75 });
  });

  it('uses Istanbul birthdays, partial age windows, and explicit two-footed requirements', () => {
    const asOf = istanbulToday(new Date('2026-12-31T21:00:00Z'));
    const result = scoreTransferMatch({ position: 'CM', ageMin: 20, preferredFoot: 'BOTH' }, {
      birthDate: '2008-01-01', preferredFoot: 'LEFT',
    }, asOf);
    expect(asOf).toBe('2027-01-01');
    expect(result.criteria).toContainEqual({ criterion: 'age', points: 1, reason: 'partial' });
    expect(result.criteria).toContainEqual({ criterion: 'foot', points: 0, reason: 'mismatch' });
    expect(scoreTransferMatch({ position: 'CM', ageMax: 23 }, { birthDate: '2000-02-30' }, today).criteria)
      .toContainEqual({ criterion: 'age', points: null, reason: 'missing' });
  });

  it.each([
    ['2026-08-30', 2, 'full'],
    ['2027-02-28', 2, 'full'],
    ['2027-03-01', 1, 'partial'],
    ['2027-08-31', 1, 'partial'],
    ['2027-09-01', 0, 'lateContract'],
  ] as const)('uses inclusive calendar-month thresholds for %s', (end, points, reason) => {
    const result = scoreTransferMatch({ position: 'CM' }, { contractEndDate: end }, '2026-08-31');
    expect(result.criteria).toContainEqual({ criterion: 'availability', points, reason });
  });

  it('updates scoring with configured weights and rejects a set of all-zero weights', () => {
    const result = scoreTransferMatch(request, { ...player, primaryPosition: 'GK' }, today, {
      ...settings, weights: { ...settings.weights, position: 7 },
    });
    expect(result.score).toBe(50);
    expect(matchingSettings.safeParse({ ...settings, weights: Object.fromEntries(matchCriteria.map(key => [key, 0])) }).success).toBe(false);
  });
});
