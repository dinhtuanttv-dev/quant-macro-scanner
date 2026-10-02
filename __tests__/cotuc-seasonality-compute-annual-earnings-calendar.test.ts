import { describe, expect, it } from 'vitest';
import { computeAnnualEarningsCalendar, daysAfterFiscalQuarterEnd } from '@/lib/cotuc/timing-v3/seasonality/compute-annual-earnings-calendar';
import type { EarningsCycleStatsV3, Quarter } from '@/lib/cotuc/timing-v3/timing-types';

function emptyStats(quarter: Quarter): EarningsCycleStatsV3 {
  return {
    ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z', eventType: 'EARNINGS', quarter,
    windows: [], selectedWindowId: null, adjustedPriceBasis: 'ADJ_CLOSE', benchmark: 'VNINDEX',
    reactionProbability: null,
  };
}
function baseStats(): Record<Quarter, EarningsCycleStatsV3> {
  return { 1: emptyStats(1), 2: emptyStats(2), 3: emptyStats(3), 4: emptyStats(4) };
}

describe('daysAfterFiscalQuarterEnd', () => {
  it('Q1 công bố 20 ngày sau 31/3 ⇒ +20', () => {
    expect(daysAfterFiscalQuarterEnd('2026-04-20', 1)).toBe(20);
  });
  it('Q4 công bố tháng 1 năm sau ⇒ tính đúng theo năm tài khoá TRƯỚC (31/12 năm trước)', () => {
    // Q4/2025 kết thúc 31/12/2025, công bố 28/1/2026 ⇒ cách 28 ngày.
    expect(daysAfterFiscalQuarterEnd('2026-01-28', 4)).toBe(28);
  });
  it('Q4 công bố cuối tháng 12 cùng năm (hiếm, công bố sớm) vẫn tính đúng theo năm đó', () => {
    expect(daysAfterFiscalQuarterEnd('2025-12-31', 4)).toBe(0);
  });
  it('ngày sai định dạng ⇒ null, không ném lỗi', () => {
    expect(daysAfterFiscalQuarterEnd('31/12/2025', 4)).toBeNull();
    expect(daysAfterFiscalQuarterEnd('', 4)).toBeNull();
  });
});

describe('computeAnnualEarningsCalendar', () => {
  it('trả đủ 4 quý theo đúng thứ tự 1-2-3-4', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: [], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    expect(r.quarters.map((q) => q.quarter)).toEqual([1, 2, 3, 4]);
  });

  it('Q4 trượt qua nhiều năm (28/1, 2/2, 30/1) vẫn cho tháng điển hình = tháng 1-2, KHÔNG bị lỗi vòng lịch', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: [], 2: [], 3: [], 4: ['2023-01-28', '2024-02-02', '2025-01-30'] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    const q4 = r.quarters.find((q) => q.quarter === 4)!;
    expect(q4.typicalAnnounceMonth === 1 || q4.typicalAnnounceMonth === 2).toBe(true);
    expect(q4.dataStatus).toBe('CONFIRMED'); // 3 sự kiện, mặc định minEvents=3
    expect(q4.nEvents).toBe(3);
    expect(q4.announceMonthStd).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(q4.announceMonthStd)).toBe(true);
  });

  it('không có lịch sử ⇒ ESTIMATED, std = 0, không bịa độ bất định', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: [], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    for (const q of r.quarters) {
      expect(q.dataStatus).toBe('ESTIMATED');
      expect(q.announceMonthStd).toBe(0);
      expect(q.nEvents).toBe(0);
    }
  });

  it('dưới minEvents (mặc định 3) ⇒ ESTIMATED dù có 1-2 sự kiện', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: ['2026-04-25', '2025-04-22'], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    expect(r.quarters.find((q) => q.quarter === 1)!.dataStatus).toBe('ESTIMATED');
  });

  it('minEventsForConfirmed tuỳ chỉnh có hiệu lực', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: ['2026-04-25', '2025-04-22'], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
      minEventsForConfirmed: 2,
    });
    expect(r.quarters.find((q) => q.quarter === 1)!.dataStatus).toBe('CONFIRMED');
  });

  it('tái dùng reactionProbability từ earningsCycleStatsByQuarter, KHÔNG tính lại', () => {
    const stats = baseStats();
    stats[1] = { ...stats[1], reactionProbability: { alpha: 5, beta: 2, mean: 5 / 7, ci: [0.3, 0.9], level: 0.9 } };
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: ['2026-04-25', '2025-04-22', '2024-04-20'], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: stats,
    });
    expect(r.quarters.find((q) => q.quarter === 1)!.reactionProbability).toEqual(stats[1].reactionProbability);
  });

  it('ngày công bố ngày lẻ khác quý vẫn tính median hợp lý (không lệch vì một điểm dị thường)', () => {
    // 3 ngày gần nhau + 1 ngày công bố rất muộn (dị thường) — median phải bám theo nhóm đông, không bị kéo bởi outlier.
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: ['2026-04-20', '2025-04-21', '2024-04-19', '2023-06-15'], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    expect(r.quarters.find((q) => q.quarter === 1)!.typicalAnnounceMonth).toBe(4);
  });
});

describe('announceModel trong lịch năm', () => {
  it('có đủ mô hình Student-t cho mỗi quý; ci90 chứa mu; nhiều dữ liệu ⇒ n đúng', () => {
    const r = computeAnnualEarningsCalendar({
      ticker: 'TST', version: 'v1', asOf: '2026-09-26T00:00:00Z',
      historicalAnnounceDatesByQuarter: { 1: ['2026-04-25', '2025-04-22', '2024-04-20', '2023-04-27'], 2: [], 3: [], 4: [] },
      earningsCycleStatsByQuarter: baseStats(),
    });
    const q1 = r.quarters.find((q) => q.quarter === 1)!;
    expect(q1.announceModel).toBeDefined();
    expect(q1.announceModel!.n).toBe(4);
    expect(q1.announceModel!.ci90[0]).toBeLessThan(q1.announceModel!.mu);
    expect(q1.announceModel!.ci90[1]).toBeGreaterThan(q1.announceModel!.mu);
    // Quý không có dữ liệu vẫn có mô hình (từ prior), n = 0
    expect(r.quarters.find((q) => q.quarter === 2)!.announceModel!.n).toBe(0);
  });
});
