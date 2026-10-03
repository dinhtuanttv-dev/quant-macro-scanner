/**
 * buy-timeline.ts — "Timeline điểm mua tối ưu": danh sách LIÊN TỤC theo ngày (từ hôm nay trở đi) các vùng mua có cơ sở
 * thống kê, gộp hai nguồn đã tính sẵn (hàm thuần, không I/O):
 *   - CHU KỲ CỔ TỨC: ảnh chụp quyết định (CotucDecisionState) — cửa sổ backtest quanh GDKHQ sắp tới.
 *   - MÙA VỤ KQKD: EarningsSeasonalityCache — cửa sổ E1–E4 quanh ngày công bố dự kiến của quý sắp tới.
 * Hai bậc, KHÔNG trộn lẫn:
 *   - VALIDATED: cửa sổ đã qua cổng thống kê của gói (≥ 8 đợt, q-value FDR, cận dưới lợi nhuận ròng > 0, ngoài mẫu).
 *   - NEAR: chưa đạt nhưng đáng theo dõi (q ≤ 0,2 hoặc cận dưới > 0, thắng ≥ 50%, kỳ vọng ròng > 0) — ghi rõ còn thiếu gì.
 * Ngày vùng mua = mốc sự kiện ± số phiên theo lịch giao dịch (tự tính + phiên thật). KHÔNG có "vùng giá mua": chưa có mô hình
 * giá đã kiểm định — giao diện hiện giá trực tiếp + mức "giá đã chạy trước" thay vì bịa khung giá.
 */
import type { HolidayCalendar, ISODate } from "./date-utils";
import { toDayNumber, dayNumberToIso } from "./date-utils";
import { DEFAULT_GATING } from "./compute-cycle-stats";
import type { BacktestWindow, EarningsCycleStatsV3, EarningsSignal } from "./timing-types";
import { addTradingDays } from "./decision/build-decision";

export type TimelineKind = "DIVIDEND" | "EARNINGS";
export type TimelineTier = "VALIDATED" | "NEAR";
export type TimelineStatus = "UPCOMING" | "IN_WINDOW" | "PASSED";

export interface TimelineRow {
  id: string;
  ticker: string;
  sector: string | null;
  kind: TimelineKind;
  tier: TimelineTier;
  status: TimelineStatus;
  /** "GDKHQ" | "Công bố KQKD Q3/2026" */
  eventLabel: string;
  eventDate: ISODate;
  /** CONFIRMED | ESTIMATED (GDKHQ) — HISTORICAL_LAG | DEADLINE_ONLY | CONFIRMED (KQKD) */
  eventDateBasis: string;
  windowId: string;
  windowLabel: string;
  entryFrom: number;
  entryTo: number;
  exitOffset: number;
  entryFromDate: ISODate;
  entryToDate: ISODate;
  exitDate: ISODate;
  /** Số phiên tới đầu vùng mua (âm = đã vào vùng). */
  sessionsToEntry: number;
  nEvents: number;
  winRate: number;
  /** Xác suất đã co về prior (cổ tức: hậu nghiệm Beta; KQKD: P(phản ứng dương)). null nếu chưa có. */
  probability: number | null;
  netExpectancy: number;
  netExpectancyLcb: number;
  fdrQValue: number;
  /** Trạng thái quyết định hiện tại của mã (chỉ cổ tức). */
  decisionLevel: "FAVORABLE" | "WATCH" | "AVOID" | null;
  missing: string[];
}

/** Một cửa sổ backtest đã lưu trong snapshot.backtest (cron timing-signals-scan). */
export type StoredWindow = Pick<BacktestWindow, "id" | "label" | "entryFrom" | "entryTo" | "exitOffset" | "nEvents" | "winRate" | "netExpectancy" | "netExpectancyLcb" | "fdrQValue" | "oosMeanNet" | "selected">;

export interface DecisionInput {
  ticker: string;
  exDate: { value: ISODate; status: string } | null;
  decisionLevel: "FAVORABLE" | "WATCH" | "AVOID";
  dividendProbability: number | null;
  windows: StoredWindow[];
}

export interface SeasonInput {
  ticker: string;
  earnings: EarningsSignal | null;
  stats: Partial<Record<string, EarningsCycleStatsV3>> | null;
}

export function missingConditions(w: Pick<StoredWindow, "nEvents" | "fdrQValue" | "netExpectancyLcb" | "oosMeanNet">): string[] {
  const out: string[] = [];
  if (w.nEvents < DEFAULT_GATING.minEvents) out.push(`cần ≥ ${DEFAULT_GATING.minEvents} đợt (đang ${w.nEvents})`);
  if (w.fdrQValue > DEFAULT_GATING.maxFdrQValue) out.push(`q-value ${w.fdrQValue.toFixed(2)} > ${DEFAULT_GATING.maxFdrQValue}`);
  if (w.netExpectancyLcb <= 0) out.push("cận dưới lợi nhuận ròng ≤ 0");
  if (w.oosMeanNet !== null && w.oosMeanNet !== undefined && w.oosMeanNet < DEFAULT_GATING.minOosMeanNetIfAvailable) out.push("ngoài mẫu âm");
  return out;
}

/** Ứng viên NEAR tốt nhất trong các cửa sổ chưa đạt. */
export function bestNearWindow<T extends StoredWindow>(windows: T[]): T | null {
  return windows
    .filter((w) => !w.selected && (w.fdrQValue <= 0.2 || w.netExpectancyLcb > 0) && w.winRate >= 0.5 && w.netExpectancy > 0 && w.nEvents >= 4)
    .sort((a, b) => missingConditions(a).length - missingConditions(b).length || a.fdrQValue - b.fdrQValue || b.netExpectancyLcb - a.netExpectancyLcb)[0] ?? null;
}

function firstTradingOnOrAfter(iso: ISODate, cal: HolidayCalendar): ISODate {
  let d = toDayNumber(iso)!;
  while (!cal.isTradingDay(d)) d++;
  return dayNumberToIso(d);
}

function sessionsBetween(from: ISODate, to: ISODate, cal: HolidayCalendar): number {
  const a = toDayNumber(from)!;
  const b = toDayNumber(to)!;
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let n = 0;
  for (let d = a; d !== b; d += step) if (cal.isTradingDay(d + step)) n += step;
  return n;
}

export interface BuildTimelineInput {
  today: ISODate;
  cal: HolidayCalendar;
  decisions: DecisionInput[];
  seasonality: SeasonInput[];
  sectors: Map<string, string | null>;
  /** Chỉ lấy vùng mua bắt đầu trong N ngày lịch tới (mặc định 180). */
  horizonDays?: number;
}

export function buildBuyTimeline(input: BuildTimelineInput): TimelineRow[] {
  const { today, cal, sectors } = input;
  const horizon = dayNumberToIso(toDayNumber(today)! + (input.horizonDays ?? 180));
  const rows: TimelineRow[] = [];

  const push = (base: Omit<TimelineRow, "status" | "entryFromDate" | "entryToDate" | "exitDate" | "sessionsToEntry">, anchor: ISODate) => {
    const entryFromDate = addTradingDays(anchor, base.entryFrom, cal);
    const entryToDate = addTradingDays(anchor, base.entryTo, cal);
    const exitDate = addTradingDays(anchor, base.exitOffset, cal);
    if (exitDate < today || entryFromDate > horizon) return;
    const status: TimelineStatus = today < entryFromDate ? "UPCOMING" : today <= entryToDate ? "IN_WINDOW" : "PASSED";
    rows.push({ ...base, status, entryFromDate, entryToDate, exitDate, sessionsToEntry: sessionsBetween(today, entryFromDate, cal) });
  };

  for (const d of input.decisions) {
    if (!d.exDate) continue;
    const anchor = d.exDate.value;
    const selected = d.windows.find((w) => w.selected) ?? null;
    const near = selected ? null : bestNearWindow(d.windows);
    const w = selected ?? near;
    if (!w) continue;
    push({
      id: `${d.ticker}:DIV:${w.id}:${anchor}`, ticker: d.ticker, sector: sectors.get(d.ticker) ?? null, kind: "DIVIDEND",
      tier: selected ? "VALIDATED" : "NEAR", eventLabel: "GDKHQ", eventDate: anchor, eventDateBasis: d.exDate.status,
      windowId: w.id, windowLabel: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo, exitOffset: w.exitOffset,
      nEvents: w.nEvents, winRate: w.winRate, probability: selected ? d.dividendProbability : null,
      netExpectancy: w.netExpectancy, netExpectancyLcb: w.netExpectancyLcb, fdrQValue: w.fdrQValue,
      decisionLevel: d.decisionLevel, missing: selected ? [] : missingConditions(w),
    }, anchor);
  }

  for (const s of input.seasonality) {
    const e = s.earnings;
    if (!e) continue;
    const q = /^Q([1-4])\//.exec(e.quarterLabel)?.[1];
    const st = q ? s.stats?.[q] ?? null : null;
    if (!st) continue;
    const day0 = firstTradingOnOrAfter(e.expectedAnnounce.date, cal);
    const selected = st.selectedWindowId ? st.windows.find((w) => w.id === st.selectedWindowId && w.selected) ?? null : null;
    const w = selected ?? bestNearWindow(st.windows);
    if (!w) continue;
    push({
      id: `${s.ticker}:EARN:${e.quarterLabel}:${w.id}`, ticker: s.ticker, sector: sectors.get(s.ticker) ?? null, kind: "EARNINGS",
      tier: selected ? "VALIDATED" : "NEAR", eventLabel: `Công bố KQKD ${e.quarterLabel}`, eventDate: day0, eventDateBasis: e.expectedAnnounce.method,
      windowId: w.id, windowLabel: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo, exitOffset: w.exitOffset,
      nEvents: w.nEvents, winRate: w.winRate, probability: st.reactionProbability?.mean ?? null,
      netExpectancy: w.netExpectancy, netExpectancyLcb: w.netExpectancyLcb, fdrQValue: w.fdrQValue,
      decisionLevel: null, missing: selected ? [] : missingConditions(w),
    }, day0);
  }

  const order: Record<TimelineStatus, number> = { IN_WINDOW: 0, UPCOMING: 1, PASSED: 2 };
  return rows.sort((a, b) =>
    order[a.status] - order[b.status]
    || a.entryFromDate.localeCompare(b.entryFromDate)
    || (a.tier === b.tier ? 0 : a.tier === "VALIDATED" ? -1 : 1)
    || b.netExpectancyLcb - a.netExpectancyLcb);
}
