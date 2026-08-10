// lib/quant-funnel/computeTang1WithScenario.ts
// DA SUA khop voi field that cua lib/quant-funnel.ts (ban cu la suy doan, sai field).

import type { Scenario } from "../types/siu-quet-ai";
import type { Tang1Stock } from "../quant-funnel";
import { taSignalPool } from "../quant-data";
import { SCENARIO_WEIGHTS } from "../quant-funnel-scenario-weights";

export interface Tang1ScenarioResult extends Tang1Stock {
  scenarioScore: number;
}

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(1, value / max));
}

function momentumProxy(ticker: string): number {
  const ta = taSignalPool[ticker];
  if (!ta) return 0.5;
  return (normalize(ta.volSpike, 2.5) + (ta.breakout ? 1 : 0)) / 2;
}

function stabilityScore(ticker: string): number {
  const ta = taSignalPool[ticker];
  if (!ta) return 0.5;
  return ta.ma50Status === "safe" ? 1 : ta.ma50Status === "warning" ? 0.5 : 0;
}

export function computeTang1WithScenario(
  baseTang1Result: Tang1Stock[],
  scenario: Scenario
): Tang1ScenarioResult[] {
  const weights = SCENARIO_WEIGHTS[scenario];

  const scored = baseTang1Result.map((item) => {
    const epsPoints = normalize(item.epsGrowth, 40);
    const momentumPoints = momentumProxy(item.ticker);
    const stabilityPoints = stabilityScore(item.ticker);

    const scenarioScore =
      epsPoints * weights.epsGrowthWeight +
      momentumPoints * (weights.rsWeight + weights.volumeSpikeWeight) +
      stabilityPoints * weights.stabilityWeight;

    return { ...item, scenarioScore: Math.round(scenarioScore * 100) };
  });

  return scored.sort((a, b) => b.scenarioScore - a.scenarioScore);
}
