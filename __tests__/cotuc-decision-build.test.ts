import { describe, expect, it } from "vitest";
import {
  addTradingDays, averageTradedValue, buildDecisionSnapshot, carBetween, curvePointAt, resolveUpcomingExDate, type PricePoint,
} from "@/lib/cotuc/timing-v3/decision/build-decision";
import { optimizeDividendTiming } from "@/lib/cotuc/timing-v3/decision/optimize-dividend-timing";
import { planIssue, planResolutions, summarizeTracking, type TrackRow } from "@/lib/cotuc/timing-v3/decision/tracking";
import { WEEKEND_ONLY_CALENDAR } from "@/lib/cotuc/timing-v3/date-utils";
import type { BacktestWindow, CycleStatsV3 } from "@/lib/cotuc/timing-v3/timing-types";

const cal = WEEKEND_ONLY_CALENDAR;

function win(over: Partial<BacktestWindow> = {}): BacktestWindow {
  return {
    id: "w3", label: "W3 · Trước GDKHQ", entryFrom: -25, entryTo: -15, exitOffset: 3, holdsThroughEx: true,
    nEvents: 10, nEff: 10, meanCarRaw: 0.03, meanCarShrunk: 0.025, netExpectancy: 0.02, netExpectancyLcb: 0.01,
    winRate: 0.8, oosHitRate: 0.7, oosMeanNet: 0.01, fdrQValue: 0.05, selected: true, ...over,
  };
}

function stats(w: BacktestWindow | null): CycleStatsV3 {
  return {
    ticker: "AAA", version: "t", asOf: "2026-10-01", eventType: "EX_DIVIDEND", windows: w ? [w] : [], selectedWindowId: w ? w.id : null,
    adjustedPriceBasis: "ADJ_CLOSE", benchmark: "VNINDEX",
  } as unknown as CycleStatsV3;
}

/** Chuỗi ngày giao dịch (T2–T6) từ `start`, giá theo hàm f(i). */
function series(start: string, n: number, f: (i: number) => number): PricePoint[] {
  const out: PricePoint[] = [];
  let d = start;
  for (let i = 0; i < n; i++) {
    out.push({ date: d, adjClose: f(i) });
    d = addTradingDays(d, 1, cal);
  }
  return out;
}

describe("resolveUpcomingExDate", () => {
  it("đợt đã thông báo (≥ hôm nay) là CONFIRMED", () => {
    const r = resolveUpcomingExDate("2026-10-03", ["2026-06-26", "2026-10-20"], ["2025-06-20"], "x");
    expect(r).toMatchObject({ value: "2026-10-20", status: "CONFIRMED" });
  });
  it("không có thông báo -> ước tính theo trung vị chu kỳ, cuộn tới ≥ hôm nay, ESTIMATED", () => {
    const r = resolveUpcomingExDate("2026-10-03", ["2024-06-20", "2025-06-20", "2026-06-20"], ["2023-06-20"], "x");
    expect(r?.status).toBe("ESTIMATED");
    expect(r!.value >= "2026-10-03").toBe(true);
    expect(r!.value.slice(0, 7)).toBe("2027-06");
  });
  it("ngày ước tính rơi vào cuối tuần -> cuộn sang phiên kế tiếp", () => {
    // 3 đợt cách nhau đúng 365 ngày, đợt kế tiếp 2026-06-20 + 365 = 2027-06-20 (Chủ nhật)
    const r = resolveUpcomingExDate("2026-10-03", ["2024-06-20", "2025-06-20", "2026-06-20"], [], "x", cal);
    expect(r?.value).toBe("2027-06-21");
  });
  it("thiếu lịch sử (< 3 đợt) -> null", () => {
    expect(resolveUpcomingExDate("2026-10-03", ["2026-06-20"], ["2025-06-20"], "x")).toBeNull();
  });
});

describe("thanh khoản + CAR", () => {
  it("averageTradedValue = trung bình giá × KL của 20 phiên cuối", () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ close: 10_000, volume: i < 10 ? 1 : 1_000_000 }));
    expect(averageTradedValue(bars)).toBe(1e10);
    expect(averageTradedValue(bars.slice(0, 5))).toBeNull();
  });
  it("carBetween = ln(mã) − ln(VN-Index), null khi lệch ngày", () => {
    const s = [{ date: "2026-01-02", adjClose: 100 }, { date: "2026-01-05", adjClose: 110 }];
    const b = [{ date: "2026-01-02", adjClose: 1000 }, { date: "2026-01-05", adjClose: 1000 }];
    expect(carBetween(s, b, "2026-01-02", "2026-01-05")).toBeCloseTo(Math.log(1.1), 10);
    expect(carBetween(s, [{ date: "2026-01-01", adjClose: 1 }], "2026-01-02", "2026-01-05")).toBeNull();
  });
  it("curvePointAt cần ≥ 5 đợt", () => {
    const paths = [0.01, 0.02, 0.03, 0.04, 0.05].map((v) => ({ car: [0, v] }));
    expect(curvePointAt([-75, -25], paths, -25)?.p25).toBeCloseTo(0.02, 10);
    expect(curvePointAt([-75, -25], paths.slice(0, 4), -25)).toBeUndefined();
  });
});

describe("optimizeDividendTiming (bản server) khớp quy ước frontend", () => {
  it("k trong [entryFrom, entryTo] -> IN_WINDOW; ngày ESTIMATED hạ confidence", () => {
    const today = "2026-10-01";
    const ex = addTradingDays(today, 20, cal);
    const r = optimizeDividendTiming({ exDate: { value: ex, status: "ESTIMATED", source: "DERIVED", asOf: "x" }, cycle: stats(win()), earnings: null }, { today, cal });
    expect(r.action).toBe("IN_WINDOW");
    expect(r.tdToEx).toBe(20);
    expect(r.confidence).toBe("LOW"); // MEDIUM (10 đợt) hạ 1 bậc
  });
  it("đã qua GDKHQ -> POST_EX; không có cửa sổ -> NO_SIGNAL", () => {
    const ex = (s: string) => ({ value: s, status: "CONFIRMED" as const, source: "DERIVED" as const, asOf: "x" });
    expect(optimizeDividendTiming({ exDate: ex("2026-09-01"), cycle: stats(win()), earnings: null }, { today: "2026-10-01", cal }).action).toBe("POST_EX");
    expect(optimizeDividendTiming({ exDate: ex("2026-12-01"), cycle: stats(null), earnings: null }, { today: "2026-10-01", cal }).action).toBe("NO_SIGNAL");
  });
});

describe("buildDecisionSnapshot", () => {
  const today = "2026-10-01";
  const bench = series("2025-01-01", 460, (i) => 1000 + i); // tăng đều, biến động thấp -> RISK_ON
  const stock = series("2025-01-01", 460, (i) => 50 + i * 0.05);
  const base = {
    ticker: "AAA", today, cal, offsets: [-75, -25, -15, 0, 3], eventPaths: [], stockPrices: stock, benchmarkPrices: bench,
    earnings: null, earningsStats: null,
  };

  it("trong vùng mua + ngày xác nhận + thanh khoản đủ -> FAVORABLE, xác suất từ hậu nghiệm Beta (không phải 0,5 + r×5)", () => {
    const ex = addTradingDays(today, 20, cal);
    const snap = buildDecisionSnapshot({
      ...base, stats: stats(win({ winRate: 0.9, nEvents: 10 })), avgValue20: 8e9,
      exDate: { value: ex, status: "CONFIRMED", source: "DERIVED", asOf: "x", label: "VNDirect" },
    });
    expect(snap.recommendation.action).toBe("IN_WINDOW");
    expect(snap.regime.regime).toBe("RISK_ON");
    expect(snap.signals[0].probability).toBeCloseTo(10 / 12, 10); // Beta(1+9, 1+1)
    expect(snap.decision.level).toBe("FAVORABLE");
    expect(snap.liquidity.ok).toBe(true);
    expect(snap.decision.checks.find((c) => c.key === "liquidity")?.detail).toContain("8.0 tỷ");
  });

  it("ngày chỉ ƯỚC TÍNH -> tối đa WATCH", () => {
    const ex = addTradingDays(today, 20, cal);
    const snap = buildDecisionSnapshot({
      ...base, stats: stats(win({ winRate: 0.9 })), avgValue20: 8e9,
      exDate: { value: ex, status: "ESTIMATED", source: "DERIVED", asOf: "x", label: "Ước tính" },
    });
    expect(snap.decision.level).toBe("WATCH");
    expect(snap.decision.checks.find((c) => c.key === "dateConfirmed")?.passed).toBe(false);
  });

  it("không có cửa sổ qua kiểm định -> AVOID, không ghi tín hiệu", () => {
    const ex = addTradingDays(today, 20, cal);
    const snap = buildDecisionSnapshot({ ...base, stats: stats(null), avgValue20: null, exDate: { value: ex, status: "CONFIRMED", source: "DERIVED", asOf: "x", label: "v" } });
    expect(snap.decision.level).toBe("AVOID");
    expect(snap.liquidity.ok).toBeNull();
    expect(planIssue(snap, [], cal, "2026-10-01T00:00:00Z")).toBeNull();
  });

  it("VN-Index dưới MA200 -> RISK_OFF, trọng số cổ tức bị nhân 0,55", () => {
    const down = series("2025-01-01", 460, (i) => 2000 - i);
    const ex = addTradingDays(today, 20, cal);
    const snap = buildDecisionSnapshot({
      ...base, benchmarkPrices: down, stats: stats(win()), avgValue20: 8e9,
      exDate: { value: ex, status: "CONFIRMED", source: "DERIVED", asOf: "x", label: "v" },
    });
    expect(snap.regime.regime).toBe("RISK_OFF");
    expect(snap.signals[0].weight).toBeCloseTo(10 * 0.55, 10);
    expect(snap.decision.level).not.toBe("FAVORABLE");
  });
});

describe("theo dõi tín hiệu", () => {
  const today = "2026-10-01";
  const bench = series("2025-01-01", 460, (i) => 1000 + i);
  const stock = series("2025-01-01", 460, (i) => 50 + i * 0.2);
  const ex = addTradingDays(today, 20, cal);
  const snap = buildDecisionSnapshot({
    ticker: "AAA", today, cal, offsets: [-75, -25, -15, 0, 3], eventPaths: [], stockPrices: stock, benchmarkPrices: bench,
    earnings: null, earningsStats: null, stats: stats(win({ winRate: 0.9 })), avgValue20: 8e9,
    exDate: { value: ex, status: "CONFIRMED", source: "DERIVED", asOf: "x", label: "v" },
  });

  it("ghi một lần khi vào vùng mua; không ghi trùng khi còn bản ghi mở", () => {
    const issue = planIssue(snap, [], cal, "2026-10-01T23:00:00Z")!;
    expect(issue).toMatchObject({ ticker: "AAA", windowId: "w3", level: "FAVORABLE", plannedExitDate: addTradingDays(ex, 3, cal) });
    expect(planIssue(snap, [issue], cal, "2026-10-02T23:00:00Z")).toBeNull();
  });

  it("chỉ ghi kết quả khi đã có giá tới ngày thoát; CAR > 0 -> outcome 1", () => {
    const issue = planIssue(snap, [], cal, "2026-10-01T23:00:00Z")!;
    expect(planResolutions([issue], stock.filter((p) => p.date <= today), bench)).toEqual([]);
    const longStock = series("2025-01-01", 520, (i) => 50 + i * 0.2);
    const longBench = series("2025-01-01", 520, (i) => 1000 + i);
    const [r] = planResolutions([issue], longStock, longBench);
    expect(r.outcome).toBe(1);
    expect(r.exitDate).toBe(issue.plannedExitDate);
  });

  it("summarizeTracking: tỷ lệ đúng, Brier, CUSUM nhắm xác suất trung bình đã báo", () => {
    const mk = (i: number, outcome: 0 | 1 | null): TrackRow => ({
      id: `T${i}`, ticker: "AAA", windowId: "w3", level: "FAVORABLE", predictedProbability: 0.7, components: [], exDate: "2026-01-01",
      exDateStatus: "CONFIRMED", entryDate: "2026-01-01", plannedExitDate: "2026-02-01", issuedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      outcome, realizedCar: outcome === null ? null : outcome ? 0.01 : -0.01, exitDate: null, outcomeRecordedAt: outcome === null ? null : `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    });
    const s = summarizeTracking([mk(0, 1), mk(1, 0), mk(2, 1), mk(3, null)]);
    expect(s.totalSignals).toBe(4);
    expect(s.resolvedSignals).toBe(3);
    expect(s.rollingAccuracy).toBeCloseTo(2 / 3, 10);
    expect(s.brierScore).toBeCloseTo((0.09 + 0.49 + 0.09) / 3, 10);
    expect(s.meanPredicted).toBeCloseTo(0.7, 10);
    expect(s.cusum.n).toBe(3);
    expect(s.byLevel[0]).toMatchObject({ level: "FAVORABLE", total: 4, resolved: 3 });
    expect(summarizeTracking([]).rollingAccuracy).toBeNull();
  });
});

describe("cửa sổ sau GDKHQ (W4/W5)", () => {
  it("đợt vừa qua chưa tới điểm thoát -> dùng đợt đó, k dương nằm trong vùng mua = IN_WINDOW", () => {
    const today = "2026-10-08";
    const past = addTradingDays(today, -4, cal);
    const ex = resolveUpcomingExDate(today, [past, "2026-04-01", "2025-10-01", "2025-04-01"], [], "x", cal, { exitOffset: 10 });
    expect(ex).toMatchObject({ value: past, status: "CONFIRMED" });
    const w4 = win({ id: "w4", label: "W4", entryFrom: 3, entryTo: 6, exitOffset: 10, holdsThroughEx: false });
    const r = optimizeDividendTiming({ exDate: ex, cycle: stats(w4), earnings: null }, { today, cal });
    expect(r.tdToEx).toBe(-4);
    expect(r.action).toBe("IN_WINDOW");
  });
  it("đã qua điểm thoát -> POST_EX như cũ", () => {
    const today = "2026-10-30";
    const past = addTradingDays(today, -15, cal);
    const w4 = win({ id: "w4", label: "W4", entryFrom: 3, entryTo: 6, exitOffset: 10, holdsThroughEx: false });
    const r = optimizeDividendTiming({ exDate: { value: past, status: "CONFIRMED", source: "DERIVED", asOf: "x" }, cycle: stats(w4), earnings: null }, { today, cal });
    expect(r.action).toBe("POST_EX");
  });
});
