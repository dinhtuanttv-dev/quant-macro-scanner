import { describe, expect, it } from 'vitest';
import { DEFAULT_COSTS } from '@/lib/cotuc/timing-v3/compute-cycle-stats';
import type { EventSample, WindowCandidate } from '@/lib/cotuc/timing-v3/compute-cycle-stats';
import { computeFullYearEarningsCycleStats, computeIndustryQuarterPrior } from '@/lib/cotuc/timing-v3/seasonality/compute-earnings-cycle-stats';
import type { Quarter } from '@/lib/cotuc/timing-v3/timing-types';

const COSTS = DEFAULT_COSTS.buyCostPct + DEFAULT_COSTS.sellCostPct + DEFAULT_COSTS.sellTaxPct;
const s = (net: number, year: number): EventSample => ({ exDate: `${year}-01-15`, carAtEntry: 0, carAtExit: Math.log(1 + net + COSTS), netDividendYield: 0, year });
const cand = (id: string, samples: EventSample[]): WindowCandidate => ({ id, label: id, entryFrom: -15, entryTo: -5, exitOffset: -1, holdsThroughEx: false, samples });
const OPTS = { version: 't', asOf: '2026-10-03T00:00:00Z' };

describe('priorByWindow (bổ sung khi tích hợp): prior riêng cho từng cửa sổ', () => {
  it('không truyền priorByWindow -> giữ nguyên kết quả cũ; truyền -> shrinkage theo đúng cửa sổ', () => {
    const own = [[0.03, 2018], [-0.01, 2019], [0.02, 2020], [0.005, 2021], [0.01, 2022]].map(([n, y]) => s(n, y));
    const neutral = computeIndustryQuarterPrior([]);
    const peersBad = computeIndustryQuarterPrior([[s(-0.05, 2020), s(-0.06, 2021)], [s(-0.04, 2020), s(-0.05, 2022)]]);
    const mk = (pbw?: Record<string, ReturnType<typeof computeIndustryQuarterPrior>>) => {
      const q = { candidates: [cand('E1', own), cand('E2', own)], prior: neutral, priorByWindow: pbw };
      return computeFullYearEarningsCycleStats('TST', { 1: q, 2: q, 3: q, 4: q } as Record<Quarter, typeof q>, OPTS);
    };
    const base = mk();
    const same = mk({});
    expect(same[1].windows.map((w) => w.meanCarShrunk)).toEqual(base[1].windows.map((w) => w.meanCarShrunk));
    const withBad = mk({ E2: peersBad });
    const e1 = withBad[1].windows.find((w) => w.id === 'E1')!, e2 = withBad[1].windows.find((w) => w.id === 'E2')!;
    expect(e1.meanCarShrunk).toBeCloseTo(base[1].windows.find((w) => w.id === 'E1')!.meanCarShrunk, 12);
    expect(e2.meanCarShrunk).toBeLessThan(e1.meanCarShrunk); // E2 co về prior xấu của nhóm ngành ở ĐÚNG cửa sổ đó
  });
});
