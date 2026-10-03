import { describe, expect, it } from "vitest";
import { bootstrapLowerBound, bootstrapLowerBoundOf, computeWindowStat, DEFAULT_BOOTSTRAP, type WindowCandidate } from "@/lib/cotuc/timing-v3/compute-cycle-stats";

const cand = (nets: number[]): WindowCandidate => ({
  id: "w", label: "w", entryFrom: -5, entryTo: -2, exitOffset: 3, holdsThroughEx: false,
  // carAtExit − carAtEntry = ln(1 + net + chi phí) để netReturnOfEvent trả đúng `net` (chi phí mặc định cộng lại)
  samples: nets.map((x, i) => ({ exDate: `20${10 + i}-06-01`, carAtEntry: 0, carAtExit: Math.log(1 + x + 0.0035 + 0.0015 + 0.001), netDividendYield: 0, year: 2010 + i })),
});

describe("cận dưới cùng thang với kỳ vọng ĐÃ CO", () => {
  it("bootstrapLowerBoundOf với ước lượng trung bình = bootstrapLowerBound cũ (cùng seed)", () => {
    const xs = [0.02, -0.01, 0.03, 0.015, 0.04, -0.005, 0.01];
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(bootstrapLowerBoundOf(xs, mean, 0.9, DEFAULT_BOOTSTRAP)).toBeCloseTo(bootstrapLowerBound(xs, 0.9, DEFAULT_BOOTSTRAP), 12);
  });

  it("mẫu nhỏ, kỳ vọng dương: cận dưới KHÔNG vượt kỳ vọng đã co (lỗi cũ: BMP E2 +2,1% vs +2,6%)", () => {
    const w = computeWindowStat(cand([0.05, 0.02, 0.03, -0.01, 0.04, 0.025])).window;
    expect(w.netExpectancyLcb).toBeLessThanOrEqual(w.netExpectancy);
  });

  it("thuộc tính trên 200 mẫu ngẫu nhiên (n 4–14): cận dưới ≤ kỳ vọng đã co", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 200; t++) {
      const n = 4 + Math.floor(rnd() * 11);
      const drift = (rnd() - 0.3) * 0.04;
      const nets = Array.from({ length: n }, () => drift + (rnd() - 0.5) * 0.08);
      const w = computeWindowStat(cand(nets)).window;
      expect(w.netExpectancyLcb).toBeLessThanOrEqual(w.netExpectancy + 1e-12);
    }
  });

  it("lợi thế rõ, đủ mẫu vẫn qua cổng (không quá khắt khe)", () => {
    const w = computeWindowStat(cand([0.04, 0.035, 0.05, 0.03, 0.045, 0.038, 0.042, 0.036, 0.05, 0.041])).window;
    expect(w.netExpectancyLcb).toBeGreaterThan(0);
    expect(w.selected).toBe(true);
  });
});
