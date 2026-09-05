// lib/types/siu-quet-ai.ts — PHASE 3 UPGRADE
// M2: TickerImpactResult.direction gio LIEN KET TUONG MINH voi ImpactDirection
// tu lib/catalyst/types.ts thay vi khai bao rieng "benefit"|"harm" trung lap.
// Neu ImpactDirection doi (vd them "neutral"), TickerImpactResult TU DONG cap
// nhat theo, khong con phu thuoc ngam vao viec dev nho sua ca 2 noi.

import type { ImpactDirection } from "@/lib/catalyst/types"; // ★PHASE 3: import thay vì khai báo lại

export type Scenario = "growth" | "cautious" | "defensive";

export interface ScenarioWeights {
  epsGrowthWeight: number;
  rsWeight: number;
  volumeSpikeWeight: number;
  stabilityWeight: number;
}

export interface MacroEventSummary {
  sourceId: string;
  title: string;
  executionDate: string;
  daysRemaining: number;
  direction: ImpactDirection; // ★PHASE 3: dùng type liên kết thay vì "benefit" | "harm" tay
  category: string;
}

export interface TickerImpactResult {
  direction: ImpactDirection | "none"; // ★PHASE 3: liên kết + mở rộng "none" tường minh
  compositeScore: number;
}

export type PinMap = Record<string, string>;

export interface FearGreedResult {
  score: number;
  label: string;
  isEstimate: true;
}

export interface MarketStatusResult {
  level: Scenario;
  label: string;
}
