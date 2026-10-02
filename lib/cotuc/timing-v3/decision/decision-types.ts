/**
 * decision-types.ts — kiểu của bộ máy quyết định 3 trạng thái (copy nguyên từ types.ts của gói
 * cotuc-timing-engine, mục "Bộ máy quyết định"). TimingAction/ConflictKind/DataStatus giữ đúng
 * giá trị như optimizeDividendTiming phía global-quanta (src/lib/quant-cotuc.ts).
 */
export type TimingAction = 'NO_DATE' | 'POST_EX' | 'NO_SIGNAL' | 'TOO_EARLY' | 'IN_WINDOW' | 'WINDOW_PASSED';
export type ConflictKind = 'NONE' | 'NEAR_EX' | 'INSIDE_HOLD';
export type DataStatus = 'CONFIRMED' | 'ANNOUNCED' | 'ESTIMATED';

export type DecisionLevel = 'FAVORABLE' | 'WATCH' | 'AVOID';

export interface ConditionCheck {
  key: string;
  label: string;
  /** true = đạt, false = không đạt, null = chưa biết (thiếu dữ liệu — KHÔNG coi là đạt). */
  passed: boolean | null;
  detail: string;
}

export interface DecisionState {
  level: DecisionLevel;
  headline: string;
  checks: ConditionCheck[];
  /** Xác suất tổng hợp (đã shrink) từ combineLogOdds — nguồn gốc con số chính hiển thị trên DecisionBar. */
  combinedProbability: number;
  disclaimer: 'NOT_INVESTMENT_ADVICE';
}

/** Điểm phân vị CAR lịch sử tại một offset (tập con của CurvePoint trong cycle-timeline.utils của gói). */
export interface CurvePoint {
  offset: number;
  n?: number;
  mean?: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
}
