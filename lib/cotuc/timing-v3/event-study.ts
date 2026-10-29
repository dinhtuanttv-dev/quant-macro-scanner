// CH0 (29/10/2026) — "Nghiên cứu sự kiện" một lần gọi cho chart mô phỏng thời điểm (Elite 10 › Hồ sơ 360°). Hàm THUẦN lắp ráp từ dữ liệu
// engine v3 SẴN CÓ (không tính lại công thức nào):
//   - đường CAR từng đợt (log-return vượt VN-Index cộng dồn) tại các mốc offset của engine,
//   - cửa sổ v3 + cổng thống kê (cổ tức: computeCycleStats; KQKD: EarningsCycleStatsV3 đã finalize),
//   - cấu hình phí (DEFAULT_COSTS) để giao diện mô phỏng vào / thoát bằng ĐÚNG công thức netReturnOfEvent,
//   - prior Beta theo cửa sổ (tỷ lệ thắng của các mã KHÁC, ≥ 5 mã có ≥ 3 đợt — cùng quy tắc cron timing-signals-scan),
//   - mốc sự kiện sắp tới (ngày + trạng thái xác nhận / ước tính) và đường của chu kỳ đang chạy.
import { DEFAULT_COSTS, netReturnOfEvent, type CostConfig } from "./compute-cycle-stats";
import { estimatePriorFromRates } from "./seasonality/beta-binomial";
import type { BacktestWindow } from "./timing-types";

export type EventKind = "DIVIDEND" | "EARNINGS";
export interface EventPath { eventDate: string; year: number; car: (number | null)[] }
export interface UpcomingEvent { date: string | null; status: string; label: string | null; source: string }
export interface EventStudy {
  ticker: string; kind: EventKind; quarter: number | null; version: string; asOf: string;
  offsets: number[]; events: EventPath[]; currentPath: (number | null)[] | null;
  windows: BacktestWindow[]; selectedWindowId: string | null;
  costs: CostConfig; costPerRoundTrip: number;
  priors: Record<string, { alpha0: number; beta0: number; peers: number; scope: "UNIVERSE_LOO" | "UNIFORM" }>;
  upcoming: UpcomingEvent | null;
  notes: string[];
}

/** Lợi suất ròng của một đợt khi vào ở offset `entry` và thoát ở offset `exit` (cùng công thức v3). null nếu thiếu CAR. */
export function netForEvent(path: (number | null)[], offsets: number[], entry: number, exit: number, costs: CostConfig = DEFAULT_COSTS): number | null {
  const a = path[offsets.indexOf(entry)], b = path[offsets.indexOf(exit)];
  if (a == null || b == null) return null;
  return netReturnOfEvent({ exDate: "", carAtEntry: a, carAtExit: b, netDividendYield: 0, year: 0 }, costs);
}

/** Prior Beta cho từng cửa sổ: tỷ lệ thắng của các mã KHÁC (nEvents ≥ 3), cần ≥ 5 mã — như cron; thiếu -> Beta(1,1) trung tính. */
export function windowPriors(windowIds: string[], otherRates: { id: string; nEvents: number; winRate: number }[], strength = 10): EventStudy["priors"] {
  const out: EventStudy["priors"] = {};
  for (const id of windowIds) {
    const rates = otherRates.filter((r) => r.id === id && r.nEvents >= 3).map((r) => r.winRate);
    out[id] = rates.length >= 5 ? { ...estimatePriorFromRates(rates, strength), peers: rates.length, scope: "UNIVERSE_LOO" } : { alpha0: 1, beta0: 1, peers: rates.length, scope: "UNIFORM" };
  }
  return out;
}

export function assembleEventStudy(input: {
  ticker: string; kind: EventKind; quarter: number | null; version: string; asOf: string;
  offsets: number[]; eventPaths: { exDate: string; car: (number | null)[] }[]; currentPath?: (number | null)[] | null;
  windows: BacktestWindow[]; selectedWindowId: string | null;
  otherRates: { id: string; nEvents: number; winRate: number }[]; upcoming: UpcomingEvent | null; notes?: string[];
}): EventStudy {
  const costs = DEFAULT_COSTS;
  return {
    ticker: input.ticker, kind: input.kind, quarter: input.quarter, version: input.version, asOf: input.asOf,
    offsets: input.offsets,
    events: input.eventPaths.map((p) => ({ eventDate: p.exDate, year: Number(p.exDate.slice(0, 4)), car: p.car })),
    currentPath: input.currentPath ?? null,
    windows: input.windows, selectedWindowId: input.selectedWindowId,
    costs, costPerRoundTrip: costs.buyCostPct + costs.sellCostPct + costs.sellTaxPct,
    priors: windowPriors(input.windows.map((w) => w.id), input.otherRates),
    upcoming: input.upcoming,
    notes: input.notes ?? [],
  };
}
