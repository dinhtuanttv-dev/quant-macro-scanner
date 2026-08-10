// lib/quant-funnel/fearGreedProxy.ts
import type { FearGreedResult } from "../types/siu-quet-ai";
function scoreFromBreadth(stocks: any[]): number {
  const withRs = stocks.filter((s) => s.rs3m !== null && s.rs3m !== undefined);
  if (withRs.length === 0) return 50;
  return Math.round((withRs.filter((s) => (s.rs3m ?? 0) > 0).length / withRs.length) * 100);
}
function scoreFromVix(vixValue: number | null): number | null {
  if (vixValue === null) return null;
  const c = Math.max(10, Math.min(40, vixValue));
  return Math.round(100 - ((c - 10) / 30) * 100);
}
function scoreFromMa50(status: "safe" | "warning" | "broken"): number {
  return status === "safe" ? 65 : status === "warning" ? 45 : 25;
}
function labelFromScore(score: number): string {
  if (score >= 75) return "Tham lam cuc do";
  if (score >= 60) return "Tham lam";
  if (score >= 40) return "Trung lap";
  if (score >= 25) return "So hai";
  return "So hai cuc do";
}
export function calculateFearGreedProxy(
  universe: any[], vixValue: number | null,
  vnIndexMa50Status: "safe" | "warning" | "broken"
): FearGreedResult {
  const vs = scoreFromVix(vixValue);
  const components = [scoreFromBreadth(universe), scoreFromMa50(vnIndexMa50Status), ...(vs !== null ? [vs] : [])];
  const score = Math.round(components.reduce((a, b) => a + b, 0) / components.length);
  return { score, label: labelFromScore(score), isEstimate: true };
}
