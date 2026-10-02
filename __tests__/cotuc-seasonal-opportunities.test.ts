import { describe, expect, it } from "vitest";
import { buildSeasonalOpportunities } from "@/lib/cotuc/timing-v3/seasonality/opportunities";
import type { BacktestWindow, EarningsCycleStatsV3 } from "@/lib/cotuc/timing-v3/timing-types";

const w = (id: string, o: Partial<BacktestWindow>): BacktestWindow => ({
  id, label: id, entryFrom: 1, entryTo: 2, exitOffset: 7, holdsThroughEx: false, nEvents: 7, nEff: 7, meanCarRaw: 0, meanCarShrunk: 0,
  netExpectancy: 0, netExpectancyLcb: -0.01, winRate: 0.5, oosHitRate: null, oosMeanNet: null, fdrQValue: 0.9, selected: false, ...o,
});
const st = (ticker: string, quarter: 1 | 2 | 3 | 4, windows: BacktestWindow[], selectedWindowId: string | null = null, rp: EarningsCycleStatsV3["reactionProbability"] = null): EarningsCycleStatsV3 => ({
  ticker, version: "t", asOf: "t", eventType: "EARNINGS", quarter, windows, selectedWindowId, adjustedPriceBasis: "ADJ_CLOSE", benchmark: "VNINDEX", reactionProbability: rp,
});

describe("cơ hội mùa vụ toàn danh mục", () => {
  it("đã đạt -> opportunities (xếp theo cận dưới CI); chưa đạt nhưng gần -> watchlist kèm điều kiện còn thiếu", () => {
    const r = buildSeasonalOpportunities({
      PVT: { 3: st("PVT", 3, [w("e3", { fdrQValue: 0.03, netExpectancyLcb: 0.018, netExpectancy: 0.02, winRate: 0.86 })]) },
      AAA: { 2: st("AAA", 2, [w("e2", { nEvents: 9, selected: true, fdrQValue: 0.05, netExpectancyLcb: 0.01 })], "e2", { alpha: 9, beta: 2, mean: 0.82, ci: [0.6, 0.95], level: 0.9 }) },
      BBB: { 1: st("BBB", 1, [w("e1", {})]) },
    });
    expect(r.opportunities.map((o) => `${o.ticker}Q${o.quarter}`)).toEqual(["AAAQ2"]);
    expect(r.watchlist).toHaveLength(1);
    expect(r.watchlist[0]).toMatchObject({ ticker: "PVT", quarter: 3, windowId: "e3", missing: ["cần ≥ 8 kỳ (đang 7)"] });
  });
});
