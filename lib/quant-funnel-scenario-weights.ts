// lib/quant-funnel-scenario-weights.ts
import type { Scenario, ScenarioWeights } from "./types/siu-quet-ai";
export const SCENARIO_WEIGHTS: Record<Scenario, ScenarioWeights> = {
  growth:    { epsGrowthWeight: 0.25, rsWeight: 0.35, volumeSpikeWeight: 0.25, stabilityWeight: 0.15 },
  cautious:  { epsGrowthWeight: 0.25, rsWeight: 0.25, volumeSpikeWeight: 0.20, stabilityWeight: 0.30 },
  defensive: { epsGrowthWeight: 0.20, rsWeight: 0.10, volumeSpikeWeight: 0.10, stabilityWeight: 0.60 },
};
