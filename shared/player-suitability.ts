import { z } from 'zod';
import { ageOn, isoDate } from './domain.js';

const leagueTier = z.object({
  tier: z.number().int().min(1).max(99),
  minScore: z.number().min(1).max(10).multipleOf(0.5),
  referenceAge: z.number().int().min(13).max(60),
  maxAgeDiff: z.number().int().min(0).max(30),
}).strict();

export const leagueTiers = z.array(leagueTier).min(1).max(20).refine(tiers => new Set(tiers.map(tier => tier.tier)).size === tiers.length);
export type LeagueTier = z.infer<typeof leagueTier>;
export const exampleLeagueTiers: readonly LeagueTier[] = [
  { tier: 1, minScore: 8, referenceAge: 26, maxAgeDiff: 4 },
  { tier: 2, minScore: 7, referenceAge: 25, maxAgeDiff: 5 },
  { tier: 3, minScore: 6, referenceAge: 24, maxAgeDiff: 6 },
];

export function suitabilityTiers(settings: unknown) {
  const saved = leagueTiers.safeParse(settings);
  return { tiers: saved.success ? saved.data.sort((a, b) => a.tier - b.tier) : exampleLeagueTiers, example: !saved.success };
}

type SuitabilityResult = LeagueTier & {
  status: 'SUITABLE' | 'CLOSE' | 'UNSUITABLE';
  scoreMeets: boolean;
  ageMeets: boolean;
};
export type Suitability = {
  asOf: string;
  example: boolean;
  missing: ('score' | 'birthDate')[];
  results: SuitabilityResult[];
  expiresIn: number;
};

export function evaluateSuitability(settings: unknown, score: number | null, birthDate: string | null, asOf: string): Suitability {
  const { tiers, example } = suitabilityTiers(settings);
  const missing: Suitability['missing'] = [];
  const validScore = leagueTier.shape.minScore.safeParse(score).data;
  const age = birthDate && birthDate <= asOf && isoDate.safeParse(birthDate).success ? ageOn(birthDate, asOf) : null;
  if (validScore === undefined) missing.push('score');
  if (age === null) missing.push('birthDate');
  const results: SuitabilityResult[] = validScore === undefined || age === null ? [] : tiers.map(tier => {
    const scoreDeficit = tier.minScore - validScore;
    const ageExcess = Math.abs(age - tier.referenceAge) - tier.maxAgeDiff;
    const scoreMeets = scoreDeficit <= 0;
    const ageMeets = ageExcess <= 0;
    const status = scoreMeets && ageMeets ? 'SUITABLE' : scoreDeficit <= 0.5 && ageExcess <= 1 ? 'CLOSE' : 'UNSUITABLE';
    return { ...tier, status, scoreMeets, ageMeets };
  });
  return { asOf, example, missing, results, expiresIn: 60 };
}
