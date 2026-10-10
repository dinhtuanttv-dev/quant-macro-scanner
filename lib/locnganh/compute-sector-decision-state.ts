// Port từ locnganh-timing-engine (backend/decision-engine/compute-sector-decision-state.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * backend/decision-engine/compute-sector-decision-state.ts
 *
 * Bản dành riêng cho ngành của compute-decision-state.ts (cotuc-timing-engine) — KHÔNG sao
 * chép nguyên văn, vì một số điều kiện của bản cổ tức không có nghĩa tương đương sạch cho
 * ngành (ví dụ "xung đột KQKD"). Thay vào đó, viết lại luật với đúng các điều kiện có ý nghĩa
 * cho xoay vòng ngành, nhưng GIỮ NGUYÊN khung 3 trạng thái + `DecisionState`/`ConditionCheck`
 * (types.ts) để `DecisionBar` (sao chép nguyên vẹn từ cotuc) dùng được không cần sửa.
 */
import type { ConditionCheck, DecisionLevel, DecisionState } from "./sector-types";
import type { EntryPlanSummary } from "@/lib/cotuc/timing-v3/decision/entry-refinement";
import type { CombinedProbability } from "@/lib/cotuc/timing-v3/decision/log-odds-combiner";
import type { MarketRegime } from "@/lib/cotuc/timing-v3/decision/market-regime";
import type { SectorTimingAction } from "./sector-types";

export interface SectorDecisionThresholds {
  favorableProbability: number;
  watchProbability: number;
}

export const DEFAULT_SECTOR_DECISION_THRESHOLDS: SectorDecisionThresholds = { favorableProbability: 0.6, watchProbability: 0.5 };

export interface SectorDecisionInput {
  action: SectorTimingAction;
  combined: CombinedProbability;
  entryPlan: EntryPlanSummary;
  marketRegime: MarketRegime;
  /** true nếu ngày chuyển quadrant dùng để tính đã XÁC NHẬN (không phải điểm RRG sơ bộ chưa chốt phiên). */
  transitionDateConfirmed: boolean;
  /** true nếu Confluence Score hiện tại CÙNG CHIỀU với xác suất thống kê (không mâu thuẫn nhau). */
  confluenceCorroborates: boolean | null;
  /** null = chưa kiểm tra thanh khoản (ADTV của rổ cổ phiếu đại diện ngành) — không chặn FAVORABLE. */
  liquidityOk: boolean | null;
}

const ACTION_TEXT: Record<SectorTimingAction, string> = {
  NO_DATE: 'Chưa có lần chuyển quadrant nào',
  POST_EX: 'Đã qua thời điểm tối ưu của lần chuyển gần nhất',
  NO_SIGNAL: 'Chưa đủ bằng chứng thống kê',
  TOO_EARLY: 'Chưa tới vùng mua',
  IN_WINDOW: 'Đang trong vùng mua',
  WINDOW_PASSED: 'Đã qua vùng mua',
};

const HARD_AVOID_ACTIONS: ReadonlySet<SectorTimingAction> = new Set(['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'WINDOW_PASSED']);

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function computeSectorDecisionState(
  input: SectorDecisionInput,
  thresholds: SectorDecisionThresholds = DEFAULT_SECTOR_DECISION_THRESHOLDS,
): DecisionState {
  const { action, combined, entryPlan, marketRegime, transitionDateConfirmed, confluenceCorroborates, liquidityOk } = input;
  const p = combined.probability;

  const checks: ConditionCheck[] = [
    { key: 'inWindow', label: 'Đang trong vùng mua', passed: action === 'IN_WINDOW', detail: ACTION_TEXT[action] },
    {
      key: 'probability',
      // null = nằm giữa hai ngưỡng (chưa rõ ràng), KHÁC "thiếu dữ liệu" — xem chú thích tương
      // ứng trong compute-decision-state.ts gốc.
      label: 'Xác suất tổng hợp đủ cao',
      passed: p >= thresholds.favorableProbability ? true : p >= thresholds.watchProbability ? null : false,
      detail: `${pct(p)} (từ ${combined.contributions.length} tín hiệu, trọng số ${combined.totalWeight.toFixed(1)})`,
    },
    {
      key: 'notRunTooFar',
      label: 'RS-Ratio chưa chạy trước quá xa',
      passed: entryPlan.runTooFar.percentile === null ? null : !entryPlan.runTooFar.hasRunTooFar,
      detail:
        entryPlan.runTooFar.percentile === null
          ? 'Chưa có dữ liệu lịch sử để so sánh'
          : `Ở phân vị ${pct(entryPlan.runTooFar.percentile)} so với các lần chuyển quadrant trước`,
    },
    {
      key: 'notInvalidated',
      label: 'Chưa chạm mức vô hiệu hoá / hết thời gian',
      passed: !entryPlan.invalidated && !entryPlan.timeStopped,
      detail: entryPlan.invalidated ? 'Đã thủng mức vô hiệu hoá (ATR)' : entryPlan.timeStopped ? 'Đã qua điểm thoát dự kiến' : 'Còn trong thời gian hợp lệ',
    },
    {
      key: 'dateConfirmed',
      label: 'Ngày chuyển quadrant đã chốt phiên',
      passed: transitionDateConfirmed,
      detail: transitionDateConfirmed ? 'Đã chốt phiên' : 'Dựa trên dữ liệu RRG trong phiên, có thể đổi khi chốt',
    },
    {
      key: 'confluenceAgrees',
      label: 'Confluence Score không mâu thuẫn',
      passed: confluenceCorroborates,
      detail: confluenceCorroborates === null ? 'Chưa có Confluence Score' : confluenceCorroborates ? 'Cùng chiều' : 'Confluence Score đang đi ngược xác suất thống kê',
    },
    {
      key: 'marketRegime',
      label: 'Thị trường chung không xấu',
      passed: marketRegime !== 'RISK_OFF',
      detail: marketRegime === 'RISK_ON' ? 'Thuận lợi' : marketRegime === 'NEUTRAL' ? 'Trung tính' : 'Đang phòng thủ (macro score thấp hoặc VN-Index dưới MA dài hạn/biến động cao)',
    },
    {
      key: 'liquidity',
      label: 'Thanh khoản rổ ngành đủ',
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
