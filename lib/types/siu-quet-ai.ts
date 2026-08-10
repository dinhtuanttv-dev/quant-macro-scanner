// lib/types/siu-quet-ai.ts
export type Scenario = "growth" | "cautious" | "defensive";
export interface ScenarioWeights {
  epsGrowthWeight: number; rsWeight: number;
  volumeSpikeWeight: number; stabilityWeight: number;
}
export interface MacroEventSummary {
  sourceId: string; title: string; executionDate: string;
  daysRemaining: number; direction: "benefit" | "harm"; category: string;
}
export interface TickerImpactResult {
  direction: "benefit" | "harm" | "none"; compositeScore: number;
}
export type PinMap = Record<string, string>;
export interface FearGreedResult {
  score: number; label: string; isEstimate: true;
}
export interface MarketStatusResult {
  level: Scenario; label: string;
}
