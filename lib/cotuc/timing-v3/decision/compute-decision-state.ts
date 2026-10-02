/**
 * backend/decision-engine/compute-decision-state.ts — Gộp TẤT CẢ nâng cấp (xác suất tổng hợp
 * đã hiệu chỉnh, chế độ thị trường, tinh chỉnh điểm vào) thành MỘT trạng thái duy nhất người
 * dùng nhìn là hiểu: FAVORABLE (thuận lợi để vào), WATCH (quan sát), AVOID (chưa nên).
 *
 * Nguyên tắc thiết kế: luật RÕ RÀNG, có thể đọc từng dòng, không phải một điểm số mờ đục cộng
 * dồn rồi so ngưỡng. Mỗi điều kiện được liệt kê thành một `ConditionCheck` để UI hiển thị
 * checklist — người dùng thấy CHÍNH XÁC vì sao trạng thái là gì, không phải "tin vào hộp đen".
 */
import type { TimingAction, DataStatus, ConflictKind, ConditionCheck, DecisionLevel, DecisionState } from './decision-types';
import type { MarketRegime } from './market-regime';
import type { EntryPlanSummary } from './entry-refinement';
import type { CombinedProbability } from './log-odds-combiner';

export interface DecisionThresholds {
  /** Xác suất tổng hợp tối thiểu để coi là FAVORABLE. Mặc định 0,6. */
  favorableProbability: number;
  /** Xác suất tổng hợp tối thiểu để còn ở mức WATCH thay vì AVOID. Mặc định 0,5. */
  watchProbability: number;
}

export const DEFAULT_DECISION_THRESHOLDS: DecisionThresholds = { favorableProbability: 0.6, watchProbability: 0.5 };

export interface DecisionInput {
  action: TimingAction;
  combined: CombinedProbability;
  entryPlan: EntryPlanSummary;
  marketRegime: MarketRegime;
  dateStatus: DataStatus | null;
  earningsConflict: ConflictKind;
  /** null = chưa biết thanh khoản — không dùng để chặn FAVORABLE, chỉ ghi nhận là "chưa kiểm tra". */
  liquidityOk: boolean | null;
}

const ACTION_TEXT: Record<TimingAction, string> = {
  NO_DATE: 'Chưa có ngày sự kiện',
  POST_EX: 'Đã qua sự kiện',
  NO_SIGNAL: 'Chưa đủ bằng chứng thống kê',
  TOO_EARLY: 'Chưa tới vùng mua',
  IN_WINDOW: 'Đang trong vùng mua',
  WINDOW_PASSED: 'Đã qua vùng mua',
};

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Hành động chắc chắn KHÔNG có cơ hội hành động ngay — luôn AVOID bất kể các chỉ số khác nói gì. */
const HARD_AVOID_ACTIONS: ReadonlySet<TimingAction> = new Set(['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'WINDOW_PASSED']);

export function computeDecisionState(input: DecisionInput, thresholds: DecisionThresholds = DEFAULT_DECISION_THRESHOLDS): DecisionState {
  const { action, combined, entryPlan, marketRegime, dateStatus, earningsConflict, liquidityOk } = input;
  const p = combined.probability;

  const checks: ConditionCheck[] = [
    {
      key: 'inWindow',
      label: 'Đang trong vùng mua',
      passed: action === 'IN_WINDOW',
      detail: ACTION_TEXT[action],
    },
    {
      key: 'probability',
      label: 'Xác suất tổng hợp đủ cao',
      // null ở đây nghĩa là "chưa rõ ràng" (nằm giữa hai ngưỡng watch/favorable), không phải
      // "thiếu dữ liệu" như các check khác — cả hai đều hiển thị trung tính trên UI nên dùng
      // chung kiểu boolean|null là hợp lý, chi tiết thật nằm ở `detail`.
      passed: p >= thresholds.favorableProbability ? true : p >= thresholds.watchProbability ? null : false,
      detail: `${pct(p)} (từ ${combined.contributions.length} tín hiệu, trọng số ${combined.totalWeight.toFixed(1)})`,
    },
    {
      key: 'notRunTooFar',
      label: 'Giá chưa chạy trước quá xa',
      passed: entryPlan.runTooFar.percentile === null ? null : !entryPlan.runTooFar.hasRunTooFar,
      detail:
        entryPlan.runTooFar.percentile === null
          ? 'Chưa có dữ liệu lịch sử để so sánh'
          : `Ở phân vị ${pct(entryPlan.runTooFar.percentile)} so với các đợt trước`,
    },
    {
      key: 'notInvalidated',
      label: 'Chưa chạm mức vô hiệu hoá / hết thời gian',
      passed: !entryPlan.invalidated && !entryPlan.timeStopped,
      detail: entryPlan.invalidated ? 'Đã thủng mức vô hiệu hoá (ATR)' : entryPlan.timeStopped ? 'Đã qua điểm thoát dự kiến' : 'Còn trong thời gian hợp lệ',
    },
    {
      key: 'dateConfirmed',
      label: 'Ngày sự kiện đã xác nhận',
      passed: dateStatus === null ? null : dateStatus === 'CONFIRMED',
      detail: dateStatus === null ? 'Chưa có thông tin' : dateStatus === 'CONFIRMED' ? 'Đã xác nhận' : 'Chỉ mới công bố/ước tính, có thể đổi',
    },
    {
      key: 'noEarningsConflict',
      label: 'Không xung đột KQKD',
      passed: earningsConflict === 'NONE',
      detail: earningsConflict === 'NONE' ? 'Không có' : earningsConflict === 'NEAR_EX' ? 'KQKD dự kiến sát ngày sự kiện' : 'KQKD rơi vào thời gian nắm giữ',
    },
    {
      key: 'marketRegime',
      label: 'Thị trường chung không xấu',
      passed: marketRegime !== 'RISK_OFF',
      detail: marketRegime === 'RISK_ON' ? 'Thuận lợi' : marketRegime === 'NEUTRAL' ? 'Trung tính' : 'Đang phòng thủ (dưới MA dài hạn hoặc biến động cao)',
    },
    {
      key: 'liquidity',
      label: 'Thanh khoản đủ',
      passed: liquidityOk,
      detail: liquidityOk === null ? 'Chưa kiểm tra' : liquidityOk ? 'Đủ' : 'Thấp — khó vào/ra ở khối lượng dự kiến',
    },
  ];

  const hardAvoid = HARD_AVOID_ACTIONS.has(action) || entryPlan.timeStopped || entryPlan.invalidated;

  let level: DecisionLevel;
  if (hardAvoid || p < thresholds.watchProbability) {
    level = 'AVOID';
  } else if (action === 'IN_WINDOW' && p >= thresholds.favorableProbability && checks.every((c) => c.key === 'liquidity' || c.passed !== false)) {
    level = 'FAVORABLE';
  } else {
    level = 'WATCH';
  }

  const failedMandatory = checks.filter((c) => c.key !== 'liquidity' && c.passed === false);
  const headline =
    level === 'FAVORABLE'
      ? `Thuận lợi để vào — xác suất tổng hợp ${pct(p)}`
      : level === 'WATCH'
        ? failedMandatory.length > 0
          ? `Quan sát — còn thiếu: ${failedMandatory.map((c) => c.label).join(', ')}`
          : 'Quan sát — chưa đủ điều kiện thuận lợi'
        : `Chưa nên vào — ${ACTION_TEXT[action]}`;

  return { level, headline, checks, combinedProbability: p, disclaimer: 'NOT_INVESTMENT_ADVICE' };
}
