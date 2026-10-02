// Tổng hợp cơ hội mùa vụ KQKD toàn danh mục (hàm thuần) cho /api/cotuc/seasonal-opportunities:
//   - opportunities: cửa sổ ĐÃ ĐẠT kiểm định (gói: scanSeasonalOpportunities — xếp theo CẬN DƯỚI CI);
//   - watchlist: ứng viên CHƯA đạt nhưng đáng theo dõi (q-value FDR ≤ 0,2 hoặc cận dưới lợi nhuận ròng > 0), ghi rõ còn
//     thiếu điều kiện nào — để người dùng biết mã nào sắp đủ bằng chứng thay vì một danh sách trống.
import { DEFAULT_GATING } from "../compute-cycle-stats";
import type { EarningsCycleStatsV3, Quarter, SeasonalOpportunity } from "../timing-types";
import { scanSeasonalOpportunities } from "./scan-seasonal-opportunities";

export interface WatchItem {
  ticker: string; quarter: Quarter; windowId: string; label: string;
  nEvents: number; netExpectancy: number; netExpectancyLcb: number; winRate: number; fdrQValue: number;
  /** Điều kiện còn thiếu so với cổng chọn của gói. */
  missing: string[];
}

export function buildSeasonalOpportunities(
  statsByTicker: Record<string, Partial<Record<string, EarningsCycleStatsV3>>>,
  { watchLimit = 12 }: { watchLimit?: number } = {},
): { opportunities: SeasonalOpportunity[]; watchlist: WatchItem[] } {
  const inputs: { ticker: string; quarter: Quarter; stats: EarningsCycleStatsV3 }[] = [];
  const watch: WatchItem[] = [];
  for (const [ticker, byQ] of Object.entries(statsByTicker)) {
    for (const q of [1, 2, 3, 4] as Quarter[]) {
      const stats = byQ[String(q)];
      if (!stats) continue;
      inputs.push({ ticker, quarter: q, stats });
      if (stats.selectedWindowId) continue;
      const cand = stats.windows
        .filter((w) => w.fdrQValue <= 0.2 || w.netExpectancyLcb > 0)
        .sort((a, b) => a.fdrQValue - b.fdrQValue || b.netExpectancyLcb - a.netExpectancyLcb)[0];
      if (!cand) continue;
      const missing: string[] = [];
      if (cand.nEvents < DEFAULT_GATING.minEvents) missing.push(`cần ≥ ${DEFAULT_GATING.minEvents} kỳ (đang ${cand.nEvents})`);
      if (cand.fdrQValue > DEFAULT_GATING.maxFdrQValue) missing.push(`q-value ${cand.fdrQValue.toFixed(2)} > ${DEFAULT_GATING.maxFdrQValue}`);
      if (cand.netExpectancyLcb <= 0) missing.push("cận dưới lợi nhuận ròng ≤ 0");
      if (cand.oosMeanNet !== null && cand.oosMeanNet < DEFAULT_GATING.minOosMeanNetIfAvailable) missing.push("ngoài mẫu âm");
      watch.push({
        ticker, quarter: q, windowId: cand.id, label: cand.label, nEvents: cand.nEvents, netExpectancy: cand.netExpectancy,
        netExpectancyLcb: cand.netExpectancyLcb, winRate: cand.winRate, fdrQValue: cand.fdrQValue, missing,
      });
    }
  }
  watch.sort((a, b) => a.missing.length - b.missing.length || a.fdrQValue - b.fdrQValue || b.netExpectancyLcb - a.netExpectancyLcb);
  return { opportunities: scanSeasonalOpportunities(inputs, { limit: 20 }), watchlist: watch.slice(0, watchLimit) };
}
