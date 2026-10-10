// Port từ locnganh-timing-engine (backend/sector-rotation/scan-sector-opportunities.test.ts).
import { describe, expect, it } from 'vitest';
import { scanSectorOpportunities } from "@/lib/locnganh/scan-sector-opportunities";
import type { SectorCycleStatsV3 } from "@/lib/locnganh/sector-types";

function stats(o: { selected: boolean; ci?: [number, number]; mean?: number; netExpectancyLcb?: number; nEvents?: number; targetQuadrant?: 'LEADING' | 'IMPROVING' }): SectorCycleStatsV3 {
  const ci = o.ci ?? [0.6, 0.8];
  const mean = o.mean ?? (ci[0] + ci[1]) / 2;
  return {
    ticker: 'X', version: 'v1', asOf: '2026-10-01T00:00:00Z', eventType: 'QUADRANT_TRANSITION',
    targetQuadrant: o.targetQuadrant ?? 'IMPROVING',
    windows: o.selected
      ? [{
          id: 'W1', label: 'W1', entryFrom: -10, entryTo: -2, exitOffset: 5, holdsThroughEx: true,
          nEvents: o.nEvents ?? 10, nEff: o.nEvents ?? 10, meanCarRaw: 0.02, meanCarShrunk: 0.02,
          netExpectancy: 0.015, netExpectancyLcb: o.netExpectancyLcb ?? 0.01, winRate: mean, oosHitRate: null,
          oosMeanNet: null, fdrQValue: 0.05, selected: true,
        }]
      : [],
    selectedWindowId: o.selected ? 'W1' : null,
    adjustedPriceBasis: 'ADJ_CLOSE', benchmark: 'VNINDEX',
    reactionProbability: o.selected ? { alpha: 5, beta: 2, mean, ci, level: 0.9 } : null,
  };
}

describe('scanSectorOpportunities', () => {
  it('loại ngành không có cửa sổ được chọn (NO_SIGNAL)', () => {
    expect(scanSectorOpportunities([{ sectorKey: 'A', stats: stats({ selected: false }) }])).toHaveLength(0);
  });

  it('xếp theo cận dưới CI, KHÔNG theo mean: ngành mẫu ít nhưng mean cao xếp SAU ngành mẫu nhiều, cận dưới cao hơn', () => {
    const riskyFewEvents = stats({ selected: true, ci: [0.3, 0.95], mean: 0.9, nEvents: 3 });
    const solidManyEvents = stats({ selected: true, ci: [0.6, 0.7], mean: 0.65, nEvents: 15 });
    const r = scanSectorOpportunities(
      [{ sectorKey: 'RISKY', stats: riskyFewEvents }, { sectorKey: 'SOLID', stats: solidManyEvents }],
      { minLowerBound: 0.2 },
    );
    expect(r.map((x) => x.sectorKey)).toEqual(['SOLID', 'RISKY']);
  });

  it('minLowerBound lọc đúng ngưỡng', () => {
    const weak = stats({ selected: true, ci: [0.3, 0.8], mean: 0.55 });
    expect(scanSectorOpportunities([{ sectorKey: 'A', stats: weak }], { minLowerBound: 0.5 })).toHaveLength(0);
  });

  it('lọc theo targetQuadrant khi chỉ định', () => {
    const improving = stats({ selected: true, targetQuadrant: 'IMPROVING' });
    const leading = stats({ selected: true, targetQuadrant: 'LEADING' });
    const r = scanSectorOpportunities(
      [{ sectorKey: 'A', stats: improving }, { sectorKey: 'B', stats: leading }],
      { minLowerBound: 0, targetQuadrant: 'IMPROVING' },
    );
    expect(r.map((x) => x.sectorKey)).toEqual(['A']);
  });

  it('limit giữ đúng thứ tự đã sắp xếp', () => {
    const items = [0.9, 0.6, 0.75].map((floor, i) => ({ sectorKey: `S${i}`, stats: stats({ selected: true, ci: [floor, floor + 0.1] }) }));
    const r = scanSectorOpportunities(items, { minLowerBound: 0, limit: 2 });
    expect(r).toHaveLength(2);
    expect(r[0].reactionProbabilityLowerBound).toBeCloseTo(0.9, 6);
    expect(r[1].reactionProbabilityLowerBound).toBeCloseTo(0.75, 6);
  });

  it('mảng rỗng ⇒ rỗng, không lỗi', () => {
    expect(scanSectorOpportunities([])).toEqual([]);
  });

  it('trả đủ trường từ cửa sổ được chọn', () => {
    const s = stats({ selected: true, ci: [0.6, 0.8], mean: 0.7, netExpectancyLcb: 0.023, nEvents: 12 });
    const r = scanSectorOpportunities([{ sectorKey: 'A', stats: s }], { minLowerBound: 0 });
    expect(r[0]).toMatchObject({ sectorKey: 'A', nEvents: 12, expectedNetReturn: 0.023, window: { entryFrom: -10, entryTo: -2, exitOffset: 5 } });
  });
});
