import { z } from 'zod';
import { ageOn, isoDate, type positions } from './domain.js';
import { marketAmount, type MarketCurrency } from './player-market.js';
import type { footOptions, NamedRecord } from './transfer-requests.js';

export const matchCriteria = ['position', 'age', 'foot', 'passport', 'salary', 'fee', 'level', 'availability'] as const;
type Criterion = typeof matchCriteria[number];
const weight = z.number().int().min(0).max(100);
export const matchingWeights = z.object({
  position: weight, age: weight, foot: weight, passport: weight,
  salary: weight, fee: weight, level: weight, availability: weight,
}).strict().refine(weights => matchCriteria.some(key => weights[key] > 0));
export const matchingSettings = z.object({
  weights: matchingWeights,
  levelMinimum: z.number().min(1).max(10).multipleOf(0.5).nullable(),
}).strict();
export type MatchingSettings = z.infer<typeof matchingSettings>;
export const defaultMatchingSettings: MatchingSettings = {
  weights: { position: 1, age: 1, foot: 1, passport: 1, salary: 1, fee: 1, level: 1, availability: 1 },
  levelMinimum: null,
};

export function matchingSettingsFor(value: unknown): MatchingSettings {
  const parsed = matchingSettings.safeParse(value);
  return parsed.success ? parsed.data : defaultMatchingSettings;
}

type Foot = typeof footOptions[number];
type Position = typeof positions[number];
type Money = { amount: string; currency: MarketCurrency };
export type MatchRequest = {
  position: Position; ageMin?: number | null; ageMax?: number | null;
  preferredFoot?: Foot | null; euRequired?: boolean | null;
  salaryBudget?: Money | null; feeBudget?: Money | null;
};
export type MatchPlayer = {
  primaryPosition?: Position | null; secondaryPositions?: readonly Position[];
  birthDate?: string | null; preferredFoot?: Foot | null; euPassport?: boolean | null;
  annualGrossSalary?: Money | null; askingFee?: Money | null; levelScore?: number | null;
  contractEndDate?: string | null;
};

type Check = {
  // Two half-points represent a full fit, so the weighted arithmetic
  // rounds the displayed percentages once.
  points: 0 | 1 | 2 | null;
  reason: 'full' | 'partial' | 'mismatch' | 'missing' | 'currency' | 'lateContract';
};
export type MatchResult = {
  score: number | null;
  coverage: number;
  criteria: (Check & { criterion: Criterion })[];
};
export const matchQuery = z.object({
  q: z.string().trim().max(100).default(''),
  sort: z.enum(['score', 'coverage', 'name']).default('score'),
  page: z.number().int().min(1).max(1000).default(1),
}).strict();
export type MatchPage = {
  items: (NamedRecord & MatchResult & { isExample: boolean })[];
  total: number; page: number; asOf: string; expiresIn: number;
};

const missing: Check = { points: null, reason: 'missing' };
const full: Check = { points: 2, reason: 'full' };
const partial: Check = { points: 1, reason: 'partial' };
const mismatch: Check = { points: 0, reason: 'mismatch' };

function minorUnits(amount: string) {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function budgetFit(budget: Money | null | undefined, actual: Money | null | undefined) {
  if (!budget) return null;
  if (!actual || !marketAmount.safeParse(actual.amount).success || !marketAmount.safeParse(budget.amount).success) return missing;
  if (budget.currency !== actual.currency) return { points: null, reason: 'currency' } as const;
  return minorUnits(actual.amount) <= minorUnits(budget.amount) ? full : mismatch;
}

function addCalendarMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months + 1, 0);
  date.setUTCDate(Math.min(day, date.getUTCDate()));
  return date.toISOString().slice(0, 10);
}

export function scoreTransferMatch(request: MatchRequest, player: MatchPlayer, today: string, settings = defaultMatchingSettings): MatchResult {
  const { weights, levelMinimum } = settings;
  const ageRequested = request.ageMin != null || request.ageMax != null;
  const birthDate = ageRequested && weights.age > 0 && player.birthDate && player.birthDate <= today && isoDate.safeParse(player.birthDate).success ? player.birthDate : null;
  const age = birthDate ? ageOn(birthDate, today) : null;
  const gap = age === null ? null : Math.max(0, (request.ageMin ?? age) - age, age - (request.ageMax ?? age));
  const end = player.contractEndDate && isoDate.safeParse(player.contractEndDate).success ? player.contractEndDate : null;
  const checks: Record<Criterion, Check | null> = {
    position: player.primaryPosition === request.position ? full
      : player.secondaryPositions?.includes(request.position) ? partial : player.primaryPosition ? mismatch : missing,
    age: ageRequested ? gap === null ? missing : gap === 0 ? full : gap === 1 ? partial : mismatch : null,
    foot: request.preferredFoot ? !player.preferredFoot ? missing
      : player.preferredFoot === request.preferredFoot || player.preferredFoot === 'BOTH' ? full : mismatch : null,
    passport: request.euRequired ? player.euPassport == null ? missing : player.euPassport ? full : mismatch : null,
    salary: budgetFit(request.salaryBudget, player.annualGrossSalary),
    fee: budgetFit(request.feeBudget, player.askingFee),
    level: levelMinimum === null ? null : player.levelScore == null || !Number.isFinite(player.levelScore) ? missing
      : player.levelScore >= levelMinimum ? full : mismatch,
    availability: !end ? missing : end <= addCalendarMonths(today, 6) ? full : end <= addCalendarMonths(today, 12) ? partial
      : { points: 0, reason: 'lateContract' },
  };
  const criteria: MatchResult['criteria'] = [];
  let requested = 0;
  let assessed = 0;
  let halfPoints = 0;
  for (const criterion of matchCriteria) {
    const check = checks[criterion];
    const weight = weights[criterion];
    if (check === null || weight === 0) continue;
    requested += weight;
    criteria.push({ criterion, ...check });
    if (check.points === null) continue;
    assessed += weight;
    halfPoints += weight * check.points;
  }
  return {
    score: assessed ? Math.round(50 * halfPoints / assessed) : null,
    coverage: requested ? Math.round(100 * assessed / requested) : 0,
    criteria,
  };
}
