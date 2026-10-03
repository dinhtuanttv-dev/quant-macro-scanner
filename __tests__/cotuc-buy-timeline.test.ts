import { describe, expect, it } from "vitest";
import { buildBuyTimeline, bestNearWindow, type StoredWindow } from "@/lib/cotuc/timing-v3/buy-timeline";
import { makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";
import { addTradingDays } from "@/lib/cotuc/timing-v3/decision/build-decision";
import { buildVndFundamentals, groupStatements, latestRatios, toQuarterlyIncomeRows } from "@/lib/cotuc/vndirect-fundamentals";
import type { EarningsCycleStatsV3, EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";

const cal = makeVnTradingCalendar(null);
const today = "2026-10-05"; // thứ Hai
const w = (over: Partial<StoredWindow>): StoredWindow => ({
  id: "w3", label: "W3 · Trước GDKHQ", entryFrom: -25, entryTo: -15, exitOffset: 3, nEvents: 10, winRate: 0.8,
  netExpectancy: 0.03, netExpectancyLcb: 0.01, fdrQValue: 0.05, oosMeanNet: 0.01, selected: true, ...over,
});

describe("buildBuyTimeline", () => {
  const exREE = addTradingDays(today, 20, cal); // REE đang trong vùng [-25,-15]
  const exBMP = addTradingDays(today, 90, cal); // BMP còn xa: W1 [-75,-60] chưa tới
  const rows = buildBuyTimeline({
    today, cal, sectors: new Map([["REE", "Năng lượng"], ["BMP", "Vật liệu XD"], ["FPT", "Công nghệ"]]),
    decisions: [
      { ticker: "REE", exDate: { value: exREE, status: "ESTIMATED" }, decisionLevel: "WATCH", dividendProbability: 0.66, windows: [w({})] },
      { ticker: "BMP", exDate: { value: exBMP, status: "CONFIRMED" }, decisionLevel: "AVOID", dividendProbability: null,
        windows: [w({ id: "w1", label: "W1", entryFrom: -75, entryTo: -60, exitOffset: 0, selected: false, nEvents: 6, fdrQValue: 0.15, netExpectancyLcb: -0.01 })] },
      { ticker: "VIC", exDate: null, decisionLevel: "AVOID", dividendProbability: null, windows: [w({})] },
    ],
    seasonality: [{
      ticker: "FPT",
      earnings: { quarterLabel: "Q3/2026", expectedAnnounce: { date: "2026-10-24", method: "HISTORICAL_LAG", lagStdDays: 2 } } as EarningsSignal,
      stats: { "3": { selectedWindowId: null, reactionProbability: { mean: 0.62 },
        windows: [w({ id: "e2", label: "E2 · Nắm qua công bố", entryFrom: -5, entryTo: -2, exitOffset: 3, selected: false, nEvents: 7, fdrQValue: 0.12, netExpectancyLcb: 0.004 })] } as unknown as EarningsCycleStatsV3 },
    }],
  });

  it("đang trong vùng mua đứng đầu; mã không có ngày GDKHQ bị bỏ", () => {
    expect(rows.map((r) => r.ticker)).toEqual(["REE", "FPT", "BMP"]);
    expect(rows[0]).toMatchObject({ status: "IN_WINDOW", tier: "VALIDATED", kind: "DIVIDEND", probability: 0.66, sector: "Năng lượng" });
    expect(rows[0].sessionsToEntry).toBeLessThanOrEqual(0);
  });
  it("ngày vùng mua tính bằng phiên giao dịch quanh mốc sự kiện", () => {
    expect(rows[0].entryFromDate).toBe(addTradingDays(exREE, -25, cal));
    expect(rows[0].exitDate).toBe(addTradingDays(exREE, 3, cal));
  });
  it("bậc gần đạt ghi rõ còn thiếu gì; KQKD neo theo phiên đầu tiên từ ngày công bố", () => {
    const fpt = rows.find((r) => r.ticker === "FPT")!;
    expect(fpt).toMatchObject({ kind: "EARNINGS", tier: "NEAR", eventLabel: "Công bố KQKD Q3/2026", eventDate: "2026-10-26", status: "UPCOMING" });
    expect(fpt.missing).toEqual(["cần ≥ 8 đợt (đang 7)", "q-value 0.12 > 0.1"]);
    const bmp = rows.find((r) => r.ticker === "BMP")!;
    expect(bmp.missing).toContain("cận dưới lợi nhuận ròng ≤ 0");
  });
  it("bestNearWindow bỏ cửa sổ thua (thắng < 50% hoặc kỳ vọng âm)", () => {
    expect(bestNearWindow([w({ selected: false, winRate: 0.4 }), w({ selected: false, netExpectancy: -0.01 })])).toBeNull();
  });
});

describe("chỉ số cơ bản VNDirect", () => {
  it("tỷ lệ mới nhất + ROE/D-E từ BCTC 4 quý liên tiếp", () => {
    const ratios = latestRatios([
      { code: "FPT", ratioCode: "PRICE_TO_EARNINGS", reportDate: "2026-10-01", value: 12 },
      { code: "FPT", ratioCode: "PRICE_TO_EARNINGS", reportDate: "2026-10-02", value: 11.7 },
      { code: "FPT", ratioCode: "BVPS_CR", reportDate: "2026-10-02", value: 21133 },
    ]);
    const q = (fd: string, item: number, v: number) => ({ code: "FPT", itemCode: item, fiscalDate: fd, numericValue: v, reportType: "QUARTER" });
    const st = groupStatements([
      q("2026-06-30", 23000, 2568e9), q("2026-03-31", 23000, 2400e9), q("2025-12-31", 23000, 2600e9), q("2025-09-30", 23000, 2432e9),
      q("2026-06-30", 13000, 32567e9), q("2026-06-30", 14000, 40996e9), q("2026-06-30", 21001, 18000e9),
    ]);
    const f = buildVndFundamentals("FPT", ratios.get("FPT"), st.get("FPT"));
    expect(f.peRatio).toBe(11.7);
    expect(f.roe).toBeCloseTo(24.4, 1);
    expect(f.debtEquity).toBeCloseTo(0.79, 2);
    expect(f.latestQuarter).toBe("Q2/2026");
    expect(toQuarterlyIncomeRows("FPT", st.get("FPT")!)[0]).toMatchObject({ year: 2026, quarter: 2, revenue: 18000e9, periodLabel: "Q2/2026" });
  });
  it("thiếu quý (không liên tiếp) -> ROE null; P/E âm -> null", () => {
    const st = groupStatements([
      { code: "X", itemCode: 23000, fiscalDate: "2026-06-30", numericValue: 1 }, { code: "X", itemCode: 23000, fiscalDate: "2025-12-31", numericValue: 1 },
      { code: "X", itemCode: 23000, fiscalDate: "2025-09-30", numericValue: 1 }, { code: "X", itemCode: 23000, fiscalDate: "2025-06-30", numericValue: 1 },
      { code: "X", itemCode: 14000, fiscalDate: "2026-06-30", numericValue: 10 }, { code: "X", itemCode: 13000, fiscalDate: "2026-06-30", numericValue: 5 },
    ]);
    const f = buildVndFundamentals("X", latestRatios([{ code: "X", ratioCode: "PRICE_TO_EARNINGS", reportDate: "2026-10-02", value: -4 }]).get("X"), st.get("X"));
    expect(f.roe).toBeNull();
    expect(f.peRatio).toBeNull();
    expect(f.debtEquity).toBe(0.5);
  });
});
