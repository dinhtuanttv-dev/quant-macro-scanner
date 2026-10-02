import { describe, expect, it } from "vitest";
import { toUpcomingSignal } from "@/lib/cotuc/timing-v3/earnings-signal-io";
import type { QuarterlyRecord } from "@/lib/cotuc/timing-v3/earnings-signal";
import type { EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";

// FPT thật: công bố ~22–28 ngày sau cuối quý.
const deadline = (y: number, q: number) => { const d = new Date(Date.UTC(y, q * 3, 0)); d.setUTCDate(d.getUTCDate() + 45); return d.toISOString().slice(0, 10); };
const rec = (y: number, q: number, announce: string, np: number): QuarterlyRecord => ({
  quarterLabel: `Q${q}/${y}`, legalDeadline: deadline(y, q), announceDate: announce, earningsMetric: np, extraordinaryShare: null,
});
const history = [
  rec(2025, 1, "2025-04-23", 2100), rec(2025, 2, "2025-07-22", 2300), rec(2025, 3, "2025-10-24", 2400),
  rec(2025, 4, "2026-01-27", 2600), rec(2026, 1, "2026-04-28", 2500),
];
const target = rec(2026, 2, "2026-07-28", 2700);
const reported: EarningsSignal = {
  ticker: "FPT", isBank: false, quarterLabel: "Q2/2026", legalDeadline: "2026-08-14",
  expectedAnnounce: { date: "2026-07-24", method: "HISTORICAL_LAG", lagStdDays: 2.2 },
  sue: 4.3, revenueGrowthYoY: -0.17, profitGrowthYoY: 0.14, profitTtmGrowthYoY: null, extraordinaryShare: null,
  quality: "OK", version: "v3-p3", asOf: "2026-10-03",
};

describe("tín hiệu KQKD nhắm QUÝ SẮP CÔNG BỐ (mục Sắp KQKD)", () => {
  it("quý gần nhất đã công bố -> quarterLabel/hạn/ngày dự kiến của quý kế tiếp; giữ SUE và tăng trưởng của kỳ vừa công bố", () => {
    const s = toUpcomingSignal(reported, { history, targetRecord: target, target: { year: 2026, quarter: 2 }, ticker: "FPT", isBank: false, asOf: "2026-10-03" });
    expect(s.quarterLabel).toBe("Q3/2026");
    expect(s.legalDeadline).toBe("2026-11-14");
    expect(s.expectedAnnounce.date > "2026-10-15" && s.expectedAnnounce.date < "2026-11-05").toBe(true);
    expect(s.sue).toBe(4.3);
    expect(s.profitGrowthYoY).toBe(0.14);
  });
  it("Q4 -> Q1 năm sau; quý gần nhất chưa công bố -> giữ nguyên", () => {
    const q4 = toUpcomingSignal(reported, { history, targetRecord: rec(2025, 4, "2026-01-27", 1), target: { year: 2025, quarter: 4 }, ticker: "FPT", isBank: false, asOf: "x" });
    expect(q4.quarterLabel).toBe("Q1/2026");
    const same = toUpcomingSignal(reported, { history, targetRecord: { ...target, announceDate: null }, target: { year: 2026, quarter: 2 }, ticker: "FPT", isBank: false, asOf: "x" });
    expect(same).toBe(reported);
  });
});
