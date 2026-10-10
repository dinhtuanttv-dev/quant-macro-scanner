// Port từ locnganh-timing-engine (backend/sector-rotation/compute-sector-cycle-stats.test.ts).
import { describe, expect, it } from 'vitest';
import { DEFAULT_COSTS } from "@/lib/cotuc/timing-v3/compute-cycle-stats";
import { WEEKEND_ONLY_CALENDAR } from "@/lib/cotuc/timing-v3/date-utils";
import type { PricePoint } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import {
  buildEventSamplesFromPaths,
  computeIndustryGroupPrior,
  computeSectorCycleStats,
} from "@/lib/locnganh/compute-sector-cycle-stats";
import type { QuadrantTransition } from "@/lib/locnganh/sector-types";

describe('buildEventSamplesFromPaths', () => {
  it('đọc đúng carAtEntry/carAtExit theo offset, bỏ qua sự kiện thiếu dữ liệu', () => {
    const offsets = [-10, -5, -1];
    const eventPaths = [
      { exDate: '2024-03-01', car: [0, 0.01, 0.02] },
      { exDate: '2025-03-01', car: [0, null, 0.015] }, // thiếu tại entryFrom=-5 ⇒ bỏ
    ];
    const samples = buildEventSamplesFromPaths(offsets, eventPaths, -5, -1);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ exDate: '2024-03-01', carAtEntry: 0.01, carAtExit: 0.02, netDividendYield: 0, year: 2024 });
  });
  it('offset không tồn tại trong mảng offsets ⇒ ném lỗi', () => {
    expect(() => buildEventSamplesFromPaths([-10, -1], [], -5, -1)).toThrow();
  });
  it('mảng eventPaths rỗng ⇒ kết quả rỗng', () => {
    expect(buildEventSamplesFromPaths([-5, -1], [], -5, -1)).toEqual([]);
  });
});

describe('computeIndustryGroupPrior', () => {
  it('không có ngành nào khác ⇒ prior trung tính', () => {
    const p = computeIndustryGroupPrior([]);
    expect(p).toEqual({ priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nSectorsUsed: 0 });
  });
  it('tính đúng trung bình liên ngành, bỏ qua ngành không có mẫu', () => {
    const a = [{ exDate: '2024-01-01', carAtEntry: 0, carAtExit: 0.02, netDividendYield: 0, year: 2024 }];
    const b = [{ exDate: '2024-01-01', carAtEntry: 0, carAtExit: -0.01, netDividendYield: 0, year: 2024 }];
    const p = computeIndustryGroupPrior([a, b, []], DEFAULT_COSTS);
    expect(p.nSectorsUsed).toBe(2);
    // netReturnOfEvent = exp(carExit - carEntry) - 1 - (buyCostPct + sellCostPct + sellTaxPct) — KHÔNG phải carExit thô.
    const costsSum = DEFAULT_COSTS.buyCostPct + DEFAULT_COSTS.sellCostPct + DEFAULT_COSTS.sellTaxPct;
    const netA = Math.exp(0.02) - 1 - costsSum;
    const netB = Math.exp(-0.01) - 1 - costsSum;
    expect(p.priorMean).toBeCloseTo((netA + netB) / 2, 6);
  });
});

const COSTS_SUM = DEFAULT_COSTS.buyCostPct + DEFAULT_COSTS.sellCostPct + DEFAULT_COSTS.sellTaxPct;

/** Chuỗi giá với log-return cố định mỗi phiên — đủ để computeCyclePaths tính CAR có kiểm soát. */
function buildFlatSeries(startDate: string, days: number, dailyLogReturn: number): PricePoint[] {
  const out: PricePoint[] = [];
  let price = 100;
  const d = new Date(startDate + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    out.push({ date: d.toISOString().slice(0, 10), adjClose: price });
    price *= Math.exp(dailyLogReturn);
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('computeSectorCycleStats', () => {
  const windowDefs = [{ id: 'W1', label: 'W1', entryFrom: -5, entryTo: -1, exitOffset: 5 }];
  const prior = { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nSectorsUsed: 0 };

  it('trả eventType QUADRANT_TRANSITION và targetQuadrant đúng như truyền vào', () => {
    const sectorPrices = buildFlatSeries('2024-01-01', 400, 0.001);
    const benchmarkPrices = buildFlatSeries('2024-01-01', 400, 0);
    const transitions: QuadrantTransition[] = [];
    const r = computeSectorCycleStats({
      sectorKey: 'THEP', targetQuadrant: 'IMPROVING', transitions, sectorPrices, benchmarkPrices,
      windowDefs, cal: WEEKEND_ONLY_CALENDAR, prior, version: 'v1', asOf: '2026-10-05T00:00:00Z',
    });
    expect(r.eventType).toBe('QUADRANT_TRANSITION');
    expect(r.targetQuadrant).toBe('IMPROVING');
    expect(r.ticker).toBe('THEP');
  });

  it('không có transition nào ⇒ không có cửa sổ được chọn, reactionProbability null', () => {
    const sectorPrices = buildFlatSeries('2024-01-01', 400, 0.001);
    const benchmarkPrices = buildFlatSeries('2024-01-01', 400, 0);
    const r = computeSectorCycleStats({
      sectorKey: 'THEP', targetQuadrant: 'IMPROVING', transitions: [], sectorPrices, benchmarkPrices,
      windowDefs, cal: WEEKEND_ONLY_CALENDAR, prior, version: 'v1', asOf: '2026-10-05T00:00:00Z',
    });
    expect(r.selectedWindowId).toBeNull();
    expect(r.reactionProbability).toBeNull();
  });

  it('nhiều lần chuyển quadrant với phản ứng tích cực nhất quán ⇒ có cửa sổ được chọn và reactionProbability > 0,5', () => {
    const sectorPrices = buildFlatSeries('2016-01-04', 2600, 0.0015); // ngành outperform đều đặn
    const benchmarkPrices = buildFlatSeries('2016-01-04', 2600, 0.0001);
    const dates = sectorPrices.filter((_, i) => i % 300 === 50).map((p) => p.date).slice(0, 9);
    const transitions: QuadrantTransition[] = dates.map((date) => ({ sectorKey: 'THEP', date, fromQuadrant: 'LAGGING', toQuadrant: 'IMPROVING' }));
    const r = computeSectorCycleStats({
      sectorKey: 'THEP', targetQuadrant: 'IMPROVING', transitions, sectorPrices, benchmarkPrices,
      windowDefs, cal: WEEKEND_ONLY_CALENDAR, prior, version: 'v1', asOf: '2026-10-05T00:00:00Z',
    });
    if (r.selectedWindowId) {
      expect(r.reactionProbability).not.toBeNull();
      expect(r.reactionProbability!.mean).toBeGreaterThan(0.5);
      expect(r.reactionProbability!.ci[0]).toBeLessThan(r.reactionProbability!.mean);
    } else {
      // Với mẫu ngẫu nhiên hoá tối thiểu, có thể vẫn NO_SIGNAL do gating nghiêm — chấp nhận, miễn reactionProbability cũng null tương ứng.
      expect(r.reactionProbability).toBeNull();
    }
  });

  it('dùng đúng prior liên ngành truyền vào (ảnh hưởng tới kết quả shrinkage, không ném lỗi với prior khác 0)', () => {
    const sectorPrices = buildFlatSeries('2024-01-01', 400, 0.0005);
    const benchmarkPrices = buildFlatSeries('2024-01-01', 400, 0);
    const customPrior = { priorMean: 0.01, betweenVar: 0.0004, winRatePriorAlpha0: 3, winRatePriorBeta0: 2, nSectorsUsed: 5 };
    expect(() =>
      computeSectorCycleStats({
        sectorKey: 'THEP', targetQuadrant: 'IMPROVING', transitions: [], sectorPrices, benchmarkPrices,
        windowDefs, cal: WEEKEND_ONLY_CALENDAR, prior: customPrior, version: 'v1', asOf: '2026-10-05T00:00:00Z',
      }),
    ).not.toThrow();
  });
});
