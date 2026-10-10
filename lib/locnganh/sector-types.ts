/**
 * lib/locnganh/sector-types.ts — kiểu riêng của engine xoay vòng ngành (gói locnganh-timing-engine, mục "Domain riêng: RRG &
 * chu kỳ xoay vòng ngành"). Kiểu DÙNG CHUNG (BacktestWindow, CycleStatsV3, DecisionState, ConditionCheck…) KHÔNG chép lại —
 * lấy từ lib/cotuc/timing-v3 đang chạy (bản mới hơn bản trong gói: có sửa cận dưới bootstrap PA #8, chốt vòng lặp vô hạn).
 */
import type { BacktestWindow, CycleStatsV3 } from "@/lib/cotuc/timing-v3/timing-types";
export type { BacktestWindow, CycleStatsV3, CyclePathsV3 } from "@/lib/cotuc/timing-v3/timing-types";
export type { ConditionCheck, DecisionLevel, DecisionState } from "@/lib/cotuc/timing-v3/decision/decision-types";
export type ISODate = string;

// =============================================================================
// Domain riêng: RRG & chu kỳ xoay vòng ngành
// =============================================================================

/** 4 góc phần tư RRG — nhãn tiếng Anh giữ nguyên vì đây là thuật ngữ chuẩn của phương pháp. */
export type Quadrant = 'LEADING' | 'IMPROVING' | 'LAGGING' | 'WEAKENING';

/** Một điểm RRG của một ngành tại một thời điểm — khớp RRGPoint trong tài liệu kế hoạch gốc. */
export interface RRGPoint {
  sectorKey: string;
  sectorLabel: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: Quadrant;
  asOf: ISODate;
}

/** Một lần ngành chuyển từ góc phần tư này sang góc phần tư khác — "sự kiện" của engine này. */
export interface QuadrantTransition {
  sectorKey: string;
  date: ISODate;
  fromQuadrant: Quadrant;
  toQuadrant: Quadrant;
}

export interface ConfluenceWeights {
  rrg: number;
  rs: number;
  volume: number;
  pvt: number;
  ad: number;
}

/** Khớp ConfluenceStock trong tài liệu kế hoạch gốc — dữ liệu đã có sẵn trong LocNganhPanel. */
export interface ConfluenceStock {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: Quadrant;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
  pvtScore: number | null; // -100..100
  adScore: number | null; // -100..100
  rrgScore: number; // 0-100
  rsScore: number; // 0-100
  volumeScore: number; // 0-100
  pvtScoreNormalized: number; // 0-100
  adScoreNormalized: number; // 0-100
  weightsUsed: ConfluenceWeights;
  confluenceScore: number; // 0-100
}

export type MacroRegime = 'RISK_ON' | 'RISK_OFF' | 'TRUNG_LAP';

/** `TimingAction` cho ngành — cùng 6 trạng thái như cotuc, ý nghĩa suy ra từ lần chuyển quadrant gần nhất. */
export type SectorTimingAction = 'NO_DATE' | 'POST_EX' | 'NO_SIGNAL' | 'TOO_EARLY' | 'IN_WINDOW' | 'WINDOW_PASSED';

/**
 * CycleStatsV3 cho MỘT ngành: giống hệt CycleStatsV3 (cùng BacktestWindow[], cùng cổng chọn)
 * cộng thêm `reactionProbability` — xác suất Bayes ngành tiếp tục outperform benchmark từ
 * entry đến exit của cửa sổ được chọn, dạng phân phối (không phải một con số winRate).
 */
export interface SectorCycleStatsV3 extends Omit<CycleStatsV3, 'eventType'> {
  eventType: 'QUADRANT_TRANSITION';
  targetQuadrant: Quadrant;
  reactionProbability: { alpha: number; beta: number; mean: number; ci: [number, number]; level: number } | null;
}

/** Một cơ hội ngành được phát hiện khi quét cả vũ trụ ngành (xem scan-sector-opportunities.ts). */
export interface SectorOpportunity {
  sectorKey: string;
  reactionProbabilityLowerBound: number;
  reactionProbabilityMean: number;
  expectedNetReturn: number;
  nEvents: number;
  window: Pick<BacktestWindow, 'entryFrom' | 'entryTo' | 'exitOffset'>;
}

/** Bulk signal cho mỗi ngành — dùng trong bảng LocNganhPanel/Top 20, một request cho cả vũ trụ ngành. */
export interface SectorTimingSignal {
  sectorKey: string;
  action: SectorTimingAction;
  tdSinceTransition: number | null;
  window: Pick<BacktestWindow, 'entryFrom' | 'entryTo' | 'exitOffset'> | null;
  expectedNetReturn: number | null;
  nEvents: number | null;
  fdrQValue: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reactionProbability: { mean: number; ci: [number, number] } | null;
}

export interface SectorTimingSignalsBulkV3 {
  version: string;
  asOf: string;
  signals: SectorTimingSignal[];
}
