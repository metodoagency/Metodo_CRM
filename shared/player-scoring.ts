import { z } from 'zod';
import { positions } from './domain.js';

const weight = z.number().int().min(0).max(100);
const score = z.number().min(1).max(10).multipleOf(0.5);
export const scoreWeights = z.tuple([weight, weight, weight]).refine(values => values.some(value => value > 0));
export const criteriaScores = z.tuple([score, score, score]);
export const positionWeights = z.partialRecord(z.enum(positions), scoreWeights);
export const playerScoringInput = z.object({
  version: z.number().int().positive(), settingsVersion: z.number().int().min(0),
  scores: criteriaScores, note: z.string().trim().min(1).max(1000),
}).strict();
export const scoreHistoryEntry = z.object({
  at: z.iso.datetime({ offset: true }), position: z.enum(positions), score,
  scores: criteriaScores, weights: scoreWeights, note: z.string().max(1000),
});

export type ScoreHistoryEntry = z.infer<typeof scoreHistoryEntry>;
export type ScoreWeights = z.infer<typeof scoreWeights>;
export type PlayerScoring = {
  version: number; settingsVersion: number; position: typeof positions[number];
  weights: ScoreWeights; score: string | null; scores: [number, number, number] | null; history: ScoreHistoryEntry[];
};

export function levelScore(scores: [number, number, number], weights: ScoreWeights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  // Subscores are half-point integers after scaling. Round the weighted result
  // once, to the nearest half point, with ties going up.
  const weightedHalfPoints = scores.reduce((sum, value, index) => sum + 2 * value * weights[index], 0);
  return Math.round(weightedHalfPoints / total) / 2;
}

export function weightsFor(settings: z.infer<typeof positionWeights>, position: typeof positions[number]): ScoreWeights {
  return settings[position] ?? [1, 1, 1];
}
