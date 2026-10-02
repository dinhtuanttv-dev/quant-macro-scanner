/**
 * backend/earnings-seasonality/scan-seasonal-opportunities.ts
 *
 * "Quét xác suất chu kỳ thời gian của KQKD": với EarningsCycleStatsV3 đã tính sẵn cho mỗi
 * (mã, quý), xếp hạng toàn vũ trụ để trả lời câu hỏi "mã nào, quý nào đáng chú ý nhất".
 *
 * Nguyên tắc xếp hạng — đây là phần "tinh vi" thật sự, không phải chi tiết trang trí:
 * XẾP HẠNG THEO CẬN DƯỚI của khoảng tin cậy Bayes (`reactionProbability.ci[0]`), KHÔNG theo
 * giá trị trung bình (`reactionProbability.mean`). Lý do: một mã có 3 sự kiện toàn thắng có
 * thể có mean cao ngang một mã có 20 sự kiện thắng 80% — nhưng cận dưới của mã 3 sự kiện sẽ
 * thấp hơn nhiều (khoảng tin cậy rộng), nên nó tự động bị xếp sau. Đây chính là cách thống kê
 * Bayes "tự phạt" các kết luận vội vàng từ mẫu nhỏ mà không cần đặt thêm ngưỡng nEvents tuỳ ý
 * chỗ này — ngưỡng nEvents đã nằm trong cổng chọn cửa sổ (selected=true) ở lớp trước rồi.
 *
 * Điều đó cũng có nghĩa: một mã với 100 sự kiện và mean=0,55 (chỉ nhỉnh hơn 50% một chút) có
 * thể xếp TRÊN một mã 3 sự kiện toàn thắng mean=1,0 — đúng ý muốn nói "ít nhưng chắc hơn
 * nhiều nhưng nhạt" tốt hơn "nhiều nhưng mong manh".
 */
import type { EarningsCycleStatsV3, Quarter, SeasonalOpportunity } from '../timing-types';

export interface ScanInput {
  ticker: string;
  quarter: Quarter;
  stats: EarningsCycleStatsV3;
}

export interface ScanOptions {
  /** Chỉ giữ cơ hội có cận dưới CI ≥ ngưỡng này. Mặc định 0,5 — "nhiều khả năng hơn là không". */
  minLowerBound?: number;
  /** Giới hạn số kết quả trả về (đã sắp xếp), None = không giới hạn. */
  limit?: number;
}

/**
 * Quét toàn vũ trụ, trả về danh sách cơ hội đã lọc (có cửa sổ được chọn, cận dưới ≥ ngưỡng)
 * và SẮP XẾP GIẢM DẦN theo cận dưới của khoảng tin cậy — không phải theo mean, không phải
 * theo expectedNetReturn (một mã có thể có kỳ vọng ròng cao nhưng xác suất phản ứng dương
 * thấp — biên độ lớn cả hai chiều; ở đây ưu tiên ĐỘ CHẮC CHẮN của tín hiệu trước).
 */
export function scanSeasonalOpportunities(inputs: ScanInput[], options: ScanOptions = {}): SeasonalOpportunity[] {
  const minLowerBound = options.minLowerBound ?? 0.5;

  const opportunities: SeasonalOpportunity[] = [];
  for (const { ticker, quarter, stats } of inputs) {
    if (!stats.selectedWindowId || !stats.reactionProbability) continue;
    const window = stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected);
    if (!window) continue;
    const lowerBound = stats.reactionProbability.ci[0];
    if (lowerBound < minLowerBound) continue;

    opportunities.push({
      ticker,
      quarter,
      reactionProbabilityLowerBound: lowerBound,
      reactionProbabilityMean: stats.reactionProbability.mean,
      expectedNetReturn: window.netExpectancyLcb,
      nEvents: window.nEvents,
      window: { entryFrom: window.entryFrom, entryTo: window.entryTo, exitOffset: window.exitOffset },
    });
  }

  opportunities.sort((a, b) => b.reactionProbabilityLowerBound - a.reactionProbabilityLowerBound);
  return options.limit !== undefined ? opportunities.slice(0, options.limit) : opportunities;
}

/**
 * Biến thể "sắp tới trong N ngày": lọc thêm theo mã nào có kỳ báo cáo tương ứng dự kiến rơi
 * trong `horizonDays` ngày tới, dùng cùng với AnnualEarningsCalendarV3 (typicalAnnounceMonth)
 * để không phải chờ đến sát ngày mới biết nên chú ý mã nào — đây là phần biến "biết mã nào
 * tốt" thành "biết mã nào tốt VÀ sắp đến lúc" (quét theo cả xác suất lẫn thời điểm).
 */
export interface UpcomingSeasonalOpportunity extends SeasonalOpportunity {
  typicalAnnounceMonth: number;
  announceMonthStd: number;
}

export function scanUpcomingSeasonalOpportunities(
  inputs: (ScanInput & { typicalAnnounceMonth: number; announceMonthStd: number })[],
  currentMonth: number,
  options: ScanOptions & { monthsAhead?: number } = {},
): UpcomingSeasonalOpportunity[] {
  const monthsAhead = options.monthsAhead ?? 2;
  const base = scanSeasonalOpportunities(inputs, options);
  const byKey = new Map(inputs.map((i) => [`${i.ticker}#${i.quarter}`, i]));

  return base
    .filter((o) => {
      const meta = byKey.get(`${o.ticker}#${o.quarter}`);
      if (!meta) return false;
      // Khoảng cách theo tháng, có vòng lịch (tháng 12 → tháng 1 chỉ cách 1, không phải 11).
      const raw = meta.typicalAnnounceMonth - currentMonth;
      const distance = ((raw % 12) + 12) % 12;
      return distance <= monthsAhead;
    })
    .map((o) => {
      const meta = byKey.get(`${o.ticker}#${o.quarter}`)!;
      return { ...o, typicalAnnounceMonth: meta.typicalAnnounceMonth, announceMonthStd: meta.announceMonthStd };
    });
}

// ---------------------------------------------------------------------------
// Quét XÁC SUẤT ĐỒNG THỜI: đúng thời điểm × đúng hướng phản ứng
// ---------------------------------------------------------------------------

import { probAnnounceWithinGivenNotYet } from './announce-date-model';
import type { AnnouncePredictive } from './announce-date-model';

export interface JointScanInput extends ScanInput {
  /** Mô hình Student-t của ngày công bố quý này (QuarterSeasonality.announceModel). */
  announceModel: Pick<AnnouncePredictive, 'mu' | 'scale' | 'dof' | 'n'>;
  /** Số ngày đã trôi qua kể từ cuối kỳ báo cáo đang chờ công bố. */
  elapsedDays: number;
  /** true nếu KQKD kỳ này đã công bố ⇒ không còn "sắp tới", bị loại khỏi quét. */
  alreadyAnnounced: boolean;
}

export interface JointOpportunity extends SeasonalOpportunity {
  /** P(công bố trong horizonDays tới | chưa công bố đến hôm nay). */
  probAnnounceInHorizon: number;
  /**
   * Điểm đồng thời THẬN TRỌNG = probAnnounceInHorizon × cận dưới CI của xác suất phản ứng dương.
   * Giả định độc lập giữa "khi nào công bố" và "phản ứng dương hay âm" — xấp xỉ hợp lý khi
   * cửa sổ mua tính theo offset từ ngày công bố thực (đã khử thời điểm), nhưng KHÔNG được kiểm
   * chứng thống kê ở đây; đây là điểm xếp hạng, không phải xác suất lãi thật.
   */
  jointScore: number;
}

export function scanJointProbability(
  inputs: JointScanInput[],
  horizonDays: number,
  options: ScanOptions = {},
): JointOpportunity[] {
  const base = scanSeasonalOpportunities(inputs, { ...options, limit: undefined });
  const byKey = new Map(inputs.map((i) => [`${i.ticker}#${i.quarter}`, i]));
  const out: JointOpportunity[] = [];
  for (const o of base) {
    const meta = byKey.get(`${o.ticker}#${o.quarter}`);
    if (!meta || meta.alreadyAnnounced) continue;
    const p = probAnnounceWithinGivenNotYet(meta.announceModel, meta.elapsedDays, horizonDays);
    out.push({ ...o, probAnnounceInHorizon: p, jointScore: p * o.reactionProbabilityLowerBound });
  }
  out.sort((a, b) => b.jointScore - a.jointScore);
  return options.limit !== undefined ? out.slice(0, options.limit) : out;
}
