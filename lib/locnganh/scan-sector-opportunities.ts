// Port từ locnganh-timing-engine (backend/sector-rotation/scan-sector-opportunities.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * lib/locnganh/ (port từ gói locnganh-timing-engine: backend/sector-rotation/scan-sector-opportunities.ts
 *
 * "Quét xác suất chu kỳ ngành": với SectorCycleStatsV3 đã tính sẵn cho mỗi ngành, xếp hạng cả
 * vũ trụ ngành để trả lời "ngành nào đáng chú ý nhất lúc này". Giống hệt nguyên tắc đã áp dụng
 * cho scan-seasonal-opportunities.ts (cotuc-timing-engine): XẾP THEO CẬN DƯỚI của khoảng tin
 * cậy Bayes, KHÔNG theo trung bình — một ngành có 3 lần chuyển quadrant toàn thắng không được
 * xếp trên một ngành có 15 lần thắng 75% chỉ vì trung bình thô cao hơn.
 */
import type { Quadrant, SectorCycleStatsV3, SectorOpportunity } from "./sector-types";

export interface SectorScanInput {
  sectorKey: string;
  stats: SectorCycleStatsV3;
}

export interface SectorScanOptions {
  /** Chỉ giữ ngành có cận dưới CI ≥ ngưỡng này. Mặc định 0,5. */
  minLowerBound?: number;
  limit?: number;
  /** Chỉ quét ngành có targetQuadrant khớp giá trị này (bỏ trống = không lọc theo quadrant). */
  targetQuadrant?: Quadrant;
}

export function scanSectorOpportunities(inputs: SectorScanInput[], options: SectorScanOptions = {}): SectorOpportunity[] {
  const minLowerBound = options.minLowerBound ?? 0.5;

  const opportunities: SectorOpportunity[] = [];
  for (const { sectorKey, stats } of inputs) {
    if (options.targetQuadrant && stats.targetQuadrant !== options.targetQuadrant) continue;
    if (!stats.selectedWindowId || !stats.reactionProbability) continue;
    const window = stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected);
    if (!window) continue;
    const lowerBound = stats.reactionProbability.ci[0];
    if (lowerBound < minLowerBound) continue;

    opportunities.push({
      sectorKey,
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
