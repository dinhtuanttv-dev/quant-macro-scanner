import { describe, expect, it } from 'vitest';
import { DEFAULT_COSTS, DEFAULT_GATING, benjaminiHochberg, computeWindowStat, oneSidedPValue, sampleVariance } from '@/lib/cotuc/timing-v3/compute-cycle-stats';
import type { EventSample, WindowCandidate } from '@/lib/cotuc/timing-v3/compute-cycle-stats';
import { computeFullYearEarningsCycleStats, computeIndustryQuarterPrior } from '@/lib/cotuc/timing-v3/seasonality/compute-earnings-cycle-stats';
import type { Quarter } from '@/lib/cotuc/timing-v3/timing-types';

const COSTS_SUM = DEFAULT_COSTS.buyCostPct + DEFAULT_COSTS.sellCostPct + DEFAULT_COSTS.sellTaxPct;

/** Tạo một EventSample có lãi ròng (sau phí) đúng bằng `net`, không cổ tức. */
function sampleForNet(net: number, year: number): EventSample {
  const gross = net + COSTS_SUM;
  return { exDate: `${year}-01-01`, carAtEntry: 0, carAtExit: Math.log(1 + gross), netDividendYield: 0, year };
}

function makeCandidate(id: string, samples: EventSample[]): WindowCandidate {
  return { id, label: id, entryFrom: -15, entryTo: -5, exitOffset: -1, holdsThroughEx: false, samples };
}

const OPTS = { version: 'test-v1', asOf: '2026-09-26T00:00:00Z' };

describe('computeIndustryQuarterPrior', () => {
  it('không có mã nào khác ⇒ prior trung tính (mean=0, Beta(1,1))', () => {
    const p = computeIndustryQuarterPrior([]);
    expect(p.priorMean).toBe(0);
    expect(p.winRatePriorAlpha0).toBe(1);
    expect(p.winRatePriorBeta0).toBe(1);
    expect(p.nTickersUsed).toBe(0);
  });
  it('nhiều mã cùng ngành, cùng quý ⇒ priorMean là trung bình liên mã, winRate prior lệch theo tỷ lệ thắng chung', () => {
    const tickerA = [sampleForNet(0.02, 2021), sampleForNet(0.03, 2022), sampleForNet(0.01, 2023)]; // toàn thắng
    const tickerB = [sampleForNet(-0.01, 2021), sampleForNet(0.02, 2022), sampleForNet(-0.02, 2023)]; // 1/3 thắng
    const prior = computeIndustryQuarterPrior([tickerA, tickerB]);
    expect(prior.priorMean).toBeGreaterThan(0); // trung bình 2 mã, một mã toàn thắng nên priorMean > 0
    expect(prior.nTickersUsed).toBe(2);
    const impliedWinRate = prior.winRatePriorAlpha0 / (prior.winRatePriorAlpha0 + prior.winRatePriorBeta0);
    expect(impliedWinRate).toBeGreaterThan(0.5); // trung bình (100%+33%)/2 ≈ 67%
    expect(impliedWinRate).toBeLessThan(1);
  });
  it('mã có mẫu rỗng bị bỏ qua, không làm lệch prior', () => {
    const tickerA = [sampleForNet(0.05, 2021), sampleForNet(0.05, 2022)];
    const withEmpty = computeIndustryQuarterPrior([tickerA, []]);
    const withoutEmpty = computeIndustryQuarterPrior([tickerA]);
    expect(withEmpty.priorMean).toBeCloseTo(withoutEmpty.priorMean, 10);
    expect(withEmpty.nTickersUsed).toBe(1);
  });
});

describe('computeFullYearEarningsCycleStats', () => {
  function fullYearInput(overrides: Partial<Record<Quarter, EventSample[]>> = {}) {
    const strongWinning = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => sampleForNet(0.03, 2016 + i)); // 8 sự kiện, toàn thắng, lãi lớn
    const weak = [sampleForNet(0.001, 2023), sampleForNet(-0.001, 2024)]; // 2 sự kiện, gần như hoà — không đủ mẫu, không có tín hiệu
    const base: Record<Quarter, EventSample[]> = { 1: strongWinning, 2: weak, 3: weak, 4: weak, ...overrides };
    const prior = computeIndustryQuarterPrior([]); // prior trung tính cho đơn giản trong test này
    const byQuarter = {
      1: { candidates: [makeCandidate('W1', base[1])], prior },
      2: { candidates: [makeCandidate('W1', base[2])], prior },
      3: { candidates: [makeCandidate('W1', base[3])], prior },
      4: { candidates: [makeCandidate('W1', base[4])], prior },
    } as Record<Quarter, { candidates: WindowCandidate[]; prior: ReturnType<typeof computeIndustryQuarterPrior> }>;
    return computeFullYearEarningsCycleStats('TST', byQuarter, OPTS);
  }

  it('trả đủ 4 quý, mỗi quý có eventType EARNINGS và đúng số quý', () => {
    const result = fullYearInput();
    for (const q of [1, 2, 3, 4] as Quarter[]) {
      expect(result[q].eventType).toBe('EARNINGS');
      expect(result[q].quarter).toBe(q);
    }
  });

  it('quý có tín hiệu mạnh (8 sự kiện toàn thắng) ⇒ có cửa sổ được chọn và reactionProbability không null', () => {
    const result = fullYearInput();
    expect(result[1].selectedWindowId).toBe('W1');
    expect(result[1].reactionProbability).not.toBeNull();
    expect(result[1].reactionProbability!.mean).toBeGreaterThan(0.5);
  });

  it('quý mẫu quá ít, lãi gần 0 ⇒ KHÔNG chọn cửa sổ nào, reactionProbability = null (không bịa số)', () => {
    const result = fullYearInput();
    expect(result[2].selectedWindowId).toBeNull();
    expect(result[2].reactionProbability).toBeNull();
    expect(result[3].selectedWindowId).toBeNull();
    expect(result[4].selectedWindowId).toBeNull();
  });

  it('reactionProbability là Beta-Binomial thật: khoảng tin cậy không suy biến, alpha+beta phản ánh cỡ mẫu', () => {
    const result = fullYearInput();
    const rp = result[1].reactionProbability!;
    expect(rp.ci[0]).toBeLessThan(rp.mean);
    expect(rp.ci[1]).toBeGreaterThan(rp.mean);
    expect(rp.alpha + rp.beta).toBeGreaterThanOrEqual(8); // ít nhất bằng số sự kiện quan sát (prior trung tính = 1+1)
  });

  it('FDR ĐƯỢC GỘP toàn năm: so với hiệu chỉnh RIÊNG từng quý, q-value của quý mạnh phải KHÁC (thường cao hơn) vì mẫu số nhiều giả thuyết hơn', () => {
    const pooled = fullYearInput();
    const pooledQ = pooled[1].windows[0].fdrQValue;

    // Tính lại q-value NẾU chỉ hiệu chỉnh riêng quý 1 (không gộp 3 quý kia) để so sánh.
    const strongWinning = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => sampleForNet(0.03, 2016 + i));
    const nets = strongWinning.map((s) => Math.exp(s.carAtExit - s.carAtEntry) - 1 - COSTS_SUM);
    const sd = Math.sqrt(sampleVariance(nets));
    const pValueAlone = oneSidedPValue(nets.reduce((a, b) => a + b, 0) / nets.length, sd, nets.length);
    const soloQ = benjaminiHochberg([pValueAlone])[0];

    // Gộp thêm 3 giả thuyết yếu (p-value gần 1) làm mẫu số BH lớn hơn ⇒ q của quý mạnh không thể tốt hơn khi đứng một mình,
    // và vì BH đơn điệu theo hạng, gộp thêm giả thuyết có p lớn hơn sẽ giữ nguyên hoặc làm q tệ đi, không bao giờ tốt lên.
    expect(pooledQ).toBeGreaterThanOrEqual(soloQ - 1e-9);
  });

  it('mọi giả thuyết yếu như nhau ⇒ vẫn được xử lý nhất quán, không có quý nào "may mắn" lọt qua ngẫu nhiên', () => {
    const allWeak = fullYearInput({
      1: [sampleForNet(0.001, 2023), sampleForNet(-0.001, 2024)],
    });
    for (const q of [1, 2, 3, 4] as Quarter[]) {
      expect(allWeak[q].selectedWindowId).toBeNull();
    }
  });
});
