// Elite 10 - Giai Trinh Hoi Tu v2. PORT TRUC TIEP tu scoring.py (Phan
// III - Scoring Engine). Trung tam thong ke: trong so 6 tru cot, regime
// adjustment, user profile, Structured Penalty (chong khuech dai tin
// hieu), Bayes-lite Confidence Interval, Star Rating.
import type { SourceData, DataStatus } from "./quality-gate";

export type MarketRegime = "trending" | "sideways" | "high_macro_risk";

export const BASE_WEIGHTS: Record<string, number> = {
  ta: 0.25, core: 0.25, sector: 0.20, catalyst: 0.15, macro: 0.10, dividend: 0.05,
};

const REGIME_ADJUSTMENT_TABLE: Record<MarketRegime, Record<string, number>> = {
  trending: { ta: 0.05, core: 0.03, dividend: -0.03, macro: -0.05 },
  sideways: { sector: 0.05, catalyst: 0.03, ta: -0.05, macro: -0.03 },
  high_macro_risk: { macro: 0.08, dividend: 0.04, catalyst: -0.05, ta: -0.07 },
};

const PROFILE_PATTERN_PRIORITY: Record<string, number> = {
  ta: 1.20, core: 0.90, sector: 0.90, catalyst: 0.90, macro: 0.85, dividend: 0.80,
};
const USER_PROFILE_TABLE: Record<string, Record<string, number>> = { pattern_priority: PROFILE_PATTERN_PRIORITY };

const STALENESS_THRESHOLD_SEC = 5;
export const BASE_CI_WIDTH = 6.0;
export const PENALTY_CAP = 25.0;
export const BULL_TRAP_PENALTY_CAP = 6.0;
export const SUSPECT_PENALTY_CAP = 9.0;
export const COLLINEARITY_PENALTY_CAP = 4.0;
export const COLLINEARITY_THRESHOLD = 0.7;

function renormalize(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const n = Object.keys(weights).length;
    return Object.fromEntries(Object.keys(weights).map((k) => [k, 1 / n]));
  }
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total]));
}

export function applyRegimeWeights(baseWeights: Record<string, number>, regime: MarketRegime): Record<string, number> {
  const adj = REGIME_ADJUSTMENT_TABLE[regime] ?? {};
  const adjusted: Record<string, number> = {};
  for (const k of Object.keys(baseWeights)) adjusted[k] = Math.max(baseWeights[k] + (adj[k] ?? 0), 0);
  return renormalize(adjusted);
}

export function applyUserProfile(weights: Record<string, number>, profileId: string): Record<string, number> {
  const multipliers = USER_PROFILE_TABLE[profileId] ?? Object.fromEntries(Object.keys(weights).map((k) => [k, 1.0]));
  const adjusted: Record<string, number> = {};
  for (const k of Object.keys(weights)) adjusted[k] = weights[k] * (multipliers[k] ?? 1.0);
  return renormalize(adjusted);
}

export function effectiveWeights(regime: MarketRegime, profileId: string): Record<string, number> {
  let w = applyRegimeWeights(BASE_WEIGHTS, regime);
  w = applyUserProfile(w, profileId);
  return w;
}

export interface TaMeta {
  eliteConvergenceScore?: number; volumeProfileDivergence?: boolean;
  vpinProxy?: number; vpinThreshold?: number; elliottAltCounts?: number;
  indicatorSeries?: Record<string, number[]>; referencePrice?: number; backtestSampleSize?: number;
  wyckoffPhase?: string | null; wyckoffPhaseDaysRemaining?: number | null;
}
export interface MacroMeta { foreignFlow?: number; }
export interface CatalystMeta { newsPumpAnomaly?: boolean; }

export interface ConfluenceProfile {
  ticker: string;
  sources: Record<string, SourceData>;
  syncStatus: "OK" | "DEGRADED";
  maxLagSec: number;
  taMeta: TaMeta;
  macroMeta: MacroMeta;
  catalystMeta: CatalystMeta;
}

export function sourcesValid(profile: ConfluenceProfile): Record<string, SourceData> {
  return Object.fromEntries(Object.entries(profile.sources).filter(([, s]) => s.status === "VALID" || s.status === "SUSPECT"));
}
export function sourcesByStatus(profile: ConfluenceProfile, status: DataStatus): Record<string, SourceData> {
  return Object.fromEntries(Object.entries(profile.sources).filter(([, s]) => s.status === status));
}

export function bullTrapDetected(profile: ConfluenceProfile): boolean {
  const taScoreHigh = (profile.taMeta.eliteConvergenceScore ?? 0) >= 80;
  const foreignSelling = (profile.macroMeta.foreignFlow ?? 0) < 0;
  const volumeDivergence = Boolean(profile.taMeta.volumeProfileDivergence ?? false);
  const vpinProxyHigh = (profile.taMeta.vpinProxy ?? 0) > (profile.taMeta.vpinThreshold ?? 0.65);
  const newsPumpFlag = Boolean(profile.catalystMeta.newsPumpAnomaly ?? false);
  return taScoreHigh && (foreignSelling || volumeDivergence || vpinProxyHigh || newsPumpFlag);
}

export function elliottAmbiguous(profile: ConfluenceProfile): boolean {
  return (profile.taMeta.elliottAltCounts ?? 0) >= 2;
}

function pearsonCorr(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - meanA) * (b[i] - meanB);
    denA += (a[i] - meanA) ** 2;
    denB += (b[i] - meanB) ** 2;
  }
  const den = Math.sqrt(denA) * Math.sqrt(denB);
  return den === 0 ? 0 : num / den;
}

export function maxPairwiseCorrelation(profile: ConfluenceProfile): number {
  const seriesMap = profile.taMeta.indicatorSeries ?? {};
  const keys = Object.keys(seriesMap);
  if (keys.length < 2) return 0.0;
  let maxCorr = 0.0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      let a = seriesMap[keys[i]], b = seriesMap[keys[j]];
      const n = Math.min(a.length, b.length);
      if (n < 5) continue;
      a = a.slice(-n); b = b.slice(-n);
      const stdA = Math.sqrt(a.reduce((s, v) => s + (v - a.reduce((x, y) => x + y, 0) / n) ** 2, 0) / n);
      const stdB = Math.sqrt(b.reduce((s, v) => s + (v - b.reduce((x, y) => x + y, 0) / n) ** 2, 0) / n);
      if (stdA === 0 || stdB === 0) continue;
      maxCorr = Math.max(maxCorr, Math.abs(pearsonCorr(a, b)));
    }
  }
  return maxCorr;
}

export interface Penalty { total: number; breakdown: Record<string, number>; }

export function computePenalty(profile: ConfluenceProfile): Penalty {
  const breakdown: Record<string, number> = {};

  if (bullTrapDetected(profile)) breakdown.bull_trap_warning = BULL_TRAP_PENALTY_CAP;
  if (elliottAmbiguous(profile)) breakdown.elliott_alternate_counts = 3.0;

  const suspect = sourcesByStatus(profile, "SUSPECT");
  const nSuspect = Object.keys(suspect).length;
  if (nSuspect > 0) breakdown.suspect_data = Math.min(SUSPECT_PENALTY_CAP, 3.0 * nSuspect);

  const corr = maxPairwiseCorrelation(profile);
  if (corr > COLLINEARITY_THRESHOLD) {
    const over = (corr - COLLINEARITY_THRESHOLD) / (1 - COLLINEARITY_THRESHOLD);
    breakdown.ta_collinearity = Math.round(Math.min(COLLINEARITY_PENALTY_CAP, over * COLLINEARITY_PENALTY_CAP) * 100) / 100;
  }

  const total = Math.min(Object.values(breakdown).reduce((a, b) => a + b, 0), PENALTY_CAP);
  return { total: Math.round(total * 100) / 100, breakdown };
}

export function scoreVolatilityFactor(recentScores: number[] | null): number {
  if (!recentScores || recentScores.length === 0) return 1.0;
  if (recentScores.length < 5) return 1.0;
  const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const std = Math.sqrt(recentScores.reduce((a, b) => a + (b - mean) ** 2, 0) / recentScores.length);
  const baselineStd = 8.0;
  return Math.max(0.5, Math.min(2.0, std / baselineStd));
}

export function computeConfidenceInterval(score: number, nAvailable: number, recentScores: number[] | null = null): [number, number] {
  nAvailable = Math.max(nAvailable, 1);
  const volFactor = scoreVolatilityFactor(recentScores);
  const halfWidth = BASE_CI_WIDTH * Math.sqrt(6 / nAvailable) * volFactor;
  const lo = Math.round(Math.max(0.0, score - halfWidth) * 10) / 10;
  const hi = Math.round(Math.min(100.0, score + halfWidth) * 10) / 10;
  return [lo, hi];
}

export function assignStarRating(score: number, nAvailable: number): number {
  if (nAvailable < 4) score = Math.min(score, 65);
  if (score >= 78 && nAvailable >= 6) return 5;
  if (score >= 65 && nAvailable >= 5) return 4;
  if (score >= 50 && nAvailable >= 4) return 3;
  if (score >= 35) return 2;
  return 1;
}

export interface ConfluenceScoreResult {
  score: number; weightsEffective: Record<string, number>; nAvailable: number;
  penalty: Penalty; ci: [number, number]; star: number;
}

export function computeConfluenceScore(
  profile: ConfluenceProfile, regime: MarketRegime, profileId = "default", recentScores: number[] | null = null
): ConfluenceScoreResult {
  const weights = effectiveWeights(regime, profileId);
  const validSources = sourcesValid(profile);
  const nAvailable = Object.keys(validSources).length;

  let activeWeights: Record<string, number> = {};
  for (const k of Object.keys(validSources)) if (k in weights) activeWeights[k] = weights[k];
  activeWeights = Object.keys(activeWeights).length > 0 ? renormalize(activeWeights) : {};

  let rawScore = 0;
  for (const [pillar, src] of Object.entries(validSources)) {
    rawScore += (activeWeights[pillar] ?? 0) * (src.signalValue ?? 0);
  }

  const penalty = computePenalty(profile);
  const score = Math.max(0.0, Math.min(100.0, rawScore - penalty.total));
  const ci = computeConfidenceInterval(score, nAvailable, recentScores);
  const star = assignStarRating(score, nAvailable);

  return { score: Math.round(score * 10) / 10, weightsEffective: activeWeights, nAvailable, penalty, ci, star };
}
