import { describe, expect, it } from 'vitest';
import { scanSeasonalOpportunities, scanUpcomingSeasonalOpportunities } from '@/lib/cotuc/timing-v3/seasonality/scan-seasonal-opportunities';
import type { EarningsCycleStatsV3, Quarter } from '@/lib/cotuc/timing-v3/timing-types';
import type { BetaPosterior } from '@/lib/cotuc/timing-v3/timing-types';

function stats(o: {
  selected: boolean;
  ci: [number, number];
  mean: number;
  netExpectancyLcb?: number;
  nEvents?: number;
}): EarningsCycleStatsV3 {
  const rp: BetaPosterior | null = o.selected ? { alpha: 5, beta: 2, mean: o.mean, ci: o.ci, level: 0.9 } : null;
  return {
    ticker: 'X', version: 'v1', asOf: '2026-09-26T00:00:00Z', eventType: 'EARNINGS', quarter: 1,
    windows: o.selected
      ? [{
          id: 'W1', label: 'W1', entryFrom: -15, entryTo: -5, exitOffset: -1, holdsThroughEx: false,
          nEvents: o.nEvents ?? 10, nEff: o.nEvents ?? 10, meanCarRaw: 0.02, meanCarShrunk: 0.02,
          netExpectancy: 0.01, netExpectancyLcb: o.netExpectancyLcb ?? 0.01, winRate: o.mean, oosHitRate: null,
          oosMeanNet: null, fdrQValue: 0.05, selected: true,
        }]
      : [],
    selectedWindowId: o.selected ? 'W1' : null,
    adjustedPriceBasis: 'ADJ_CLOSE', benchmark: 'VNINDEX',
    reactionProbability: rp,
  };
}

describe('scanSeasonalOpportunities', () => {
  it('loại bỏ mã/quý không có cửa sổ được chọn (NO_SIGNAL)', () => {
    const r = scanSeasonalOpportunities([{ ticker: 'A', quarter: 1, stats: stats({ selected: false, ci: [0, 1], mean: 0 }) }]);
    expect(r).toHaveLength(0);
  });

  it('lọc theo cận dưới CI, KHÔNG theo mean', () => {
    const highMeanLowFloor = stats({ selected: true, ci: [0.55, 0.95], mean: 0.9 }); // mean cao nhưng CI rộng (mẫu ít), floor vẫn qua ngưỡng
    const modestMeanHighFloor = stats({ selected: true, ci: [0.6, 0.7], mean: 0.65 }); // mean thấp hơn nhưng chắc chắn hơn, floor cao hơn
    const r = scanSeasonalOpportunities(
      [
        { ticker: 'RISKY', quarter: 1, stats: highMeanLowFloor },
        { ticker: 'SOLID', quarter: 2, stats: modestMeanHighFloor },
      ],
      { minLowerBound: 0.5 },
    );
    expect(r.map((x) => x.ticker)).toEqual(['SOLID', 'RISKY']); // SOLID xếp trên dù mean thấp hơn
  });

  it('minLowerBound loại bỏ cơ hội có cận dưới thấp hơn ngưỡng', () => {
    const weak = stats({ selected: true, ci: [0.3, 0.8], mean: 0.55 });
    const r = scanSeasonalOpportunities([{ ticker: 'A', quarter: 1, stats: weak }], { minLowerBound: 0.5 });
    expect(r).toHaveLength(0);
  });

  it('limit giới hạn đúng số kết quả, giữ thứ tự đã sắp xếp', () => {
    const items = [0.9, 0.6, 0.75].map((floor, i) => ({
      ticker: `T${i}`, quarter: 1 as Quarter,
      stats: stats({ selected: true, ci: [floor, floor + 0.1], mean: floor + 0.05 }),
    }));
    const r = scanSeasonalOpportunities(items, { minLowerBound: 0, limit: 2 });
    expect(r).toHaveLength(2);
    expect(r[0].reactionProbabilityLowerBound).toBeCloseTo(0.9, 6);
    expect(r[1].reactionProbabilityLowerBound).toBeCloseTo(0.75, 6);
  });

  it('mảng rỗng ⇒ kết quả rỗng, không lỗi', () => {
    expect(scanSeasonalOpportunities([])).toEqual([]);
  });

  it('trả đủ trường window/nEvents/expectedNetReturn từ cửa sổ được chọn', () => {
    const s = stats({ selected: true, ci: [0.6, 0.8], mean: 0.7, netExpectancyLcb: 0.023, nEvents: 12 });
    const r = scanSeasonalOpportunities([{ ticker: 'A', quarter: 3, stats: s }], { minLowerBound: 0 });
    expect(r[0]).toMatchObject({
      ticker: 'A', quarter: 3, nEvents: 12, expectedNetReturn: 0.023,
      window: { entryFrom: -15, entryTo: -5, exitOffset: -1 },
    });
  });
});

describe('scanUpcomingSeasonalOpportunities', () => {
  const base = (ticker: string, month: number, floor = 0.6) => ({
    ticker, quarter: 1 as Quarter, stats: stats({ selected: true, ci: [floor, floor + 0.2], mean: floor + 0.1 }),
    typicalAnnounceMonth: month, announceMonthStd: 0.5,
  });

  it('chỉ giữ mã có tháng công bố điển hình trong monthsAhead tới, có vòng lịch cuối năm', () => {
    const items = [base('SOON', 10), base('FAR', 3), base('WRAP', 1)]; // hiện tại tháng 9, monthsAhead=2 → 9,10,11
    const r = scanUpcomingSeasonalOpportunities(items, 9, { minLowerBound: 0, monthsAhead: 2 });
    expect(r.map((x) => x.ticker).sort()).toEqual(['SOON']);
  });

  it('vòng lịch: hiện tại tháng 11, monthsAhead=2 ⇒ nhận cả tháng 12 và tháng 1', () => {
    const items = [base('DEC', 12), base('JAN', 1), base('APR', 4)];
    const r = scanUpcomingSeasonalOpportunities(items, 11, { minLowerBound: 0, monthsAhead: 2 });
    expect(r.map((x) => x.ticker).sort()).toEqual(['DEC', 'JAN']);
  });

  it('kèm đúng typicalAnnounceMonth/announceMonthStd trong kết quả', () => {
    const items = [base('SOON', 10, 0.7)];
    const r = scanUpcomingSeasonalOpportunities(items, 9, { minLowerBound: 0 });
    expect(r[0]).toMatchObject({ typicalAnnounceMonth: 10, announceMonthStd: 0.5 });
  });
});

import { scanJointProbability } from '@/lib/cotuc/timing-v3/seasonality/scan-seasonal-opportunities';

describe('scanJointProbability', () => {
  const mk = (ticker: string, floor: number, mu: number, elapsed: number, announced = false) => ({
    ticker, quarter: 1 as Quarter,
    stats: stats({ selected: true, ci: [floor, floor + 0.1], mean: floor + 0.05 }),
    announceModel: { mu, scale: 4, dof: 8, n: 10 },
    elapsedDays: elapsed,
    alreadyAnnounced: announced,
  });

  it('loại mã đã công bố; xếp theo jointScore = P(thời điểm) × cận dưới', () => {
    const r = scanJointProbability(
      [mk('SOON', 0.6, 30, 25), mk('LATER', 0.9, 60, 25), mk('DONE', 0.95, 30, 40, true)],
      15,
      { minLowerBound: 0 },
    );
    expect(r.map((x) => x.ticker)).not.toContain('DONE');
    // SOON: mu=30, elapsed=25, horizon 15 ⇒ gần như chắc chắn công bố; LATER: mu=60 ⇒ rất khó trong 15 ngày tới.
    expect(r[0].ticker).toBe('SOON');
    expect(r[0].probAnnounceInHorizon).toBeGreaterThan(0.9);
    expect(r.find((x) => x.ticker === 'LATER')!.probAnnounceInHorizon).toBeLessThan(0.05);
    expect(r[0].jointScore).toBeCloseTo(r[0].probAnnounceInHorizon * r[0].reactionProbabilityLowerBound, 10);
  });

  it('jointScore không bao giờ vượt cận dưới CI (xác suất ≤ 1)', () => {
    const r = scanJointProbability([mk('A', 0.7, 30, 28)], 60, { minLowerBound: 0 });
    expect(r[0].jointScore).toBeLessThanOrEqual(r[0].reactionProbabilityLowerBound + 1e-12);
  });

  it('limit áp dụng SAU khi sắp xếp theo jointScore', () => {
    const r = scanJointProbability([mk('A', 0.6, 30, 25), mk('B', 0.7, 30, 25), mk('C', 0.8, 30, 25)], 15, { minLowerBound: 0, limit: 2 });
    expect(r).toHaveLength(2);
    expect(r[0].jointScore).toBeGreaterThanOrEqual(r[1].jointScore);
  });
});
