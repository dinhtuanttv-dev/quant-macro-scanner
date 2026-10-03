/**
 * optimize-dividend-timing.ts — bản server của optimizeDividendTiming / resolveEarningsImpact /
 * estimateDividendFrequency (port NGUYÊN logic từ global-quanta src/lib/quant-cotuc.ts, mục 6.3,
 * 7.5, 8 của tài liệu v3) để cron tính DecisionState đúng như tab Optimal Timing đang tính ở
 * trình duyệt. Đổi một chỗ thì phải đổi cả hai nơi.
 */
import { dayNumberToIso, toDayNumber, tradingDaysBetween, type HolidayCalendar, type ISODate } from "../date-utils";
import type { AnnounceMethod, BacktestWindow, CycleStatsV3, EarningsSignal, Sourced } from "../timing-types";
import type { ConflictKind, DataStatus, TimingAction } from "./decision-types";

export interface EngineConfig {
  conflictWindowTd: number;
  minEventsForHigh: number;
  minEventsForMedium: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { conflictWindowTd: 3, minEventsForHigh: 12, minEventsForMedium: 8 };

export interface TimingDeps {
  today: ISODate;
  cal: HolidayCalendar;
  cfg?: EngineConfig;
}

export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type EarningsStance = "AVOID" | "REDUCE_SIZE" | "NEUTRAL" | "FAVORABLE" | "UNKNOWN";

export interface EarningsImpact {
  expectedAnnounce: ISODate | null;
  announceMethod: AnnounceMethod | null;
  tdToEarnings: number | null;
  conflict: ConflictKind;
  scoreDelta: number | null;
  stance: EarningsStance;
  reasons: string[];
}

export interface TimingRecommendation {
  action: TimingAction;
  tdToEx: number | null;
  window: Pick<BacktestWindow, "id" | "label" | "entryFrom" | "entryTo" | "exitOffset" | "holdsThroughEx"> | null;
  expectedNetReturn: number | null;
  nEvents: number | null;
  confidence: Confidence | null;
  dateStatus: DataStatus | null;
  earningsImpact: EarningsImpact;
}

const downgrade = (c: Confidence): Confidence => (c === "HIGH" ? "MEDIUM" : "LOW");

const UNKNOWN_IMPACT: EarningsImpact = {
  expectedAnnounce: null, announceMethod: null, tdToEarnings: null, conflict: "NONE", scoreDelta: null, stance: "UNKNOWN", reasons: [],
};

export function resolveEarningsImpact(
  input: { earnings: EarningsSignal | null; tdToEx: number | null; window: { entryTo: number; exitOffset: number } | null },
  deps: TimingDeps,
): EarningsImpact {
  const cfg = deps.cfg ?? DEFAULT_ENGINE_CONFIG;
  const { earnings, tdToEx, window } = input;
  if (!earnings) return UNKNOWN_IMPACT;

  const ann = earnings.expectedAnnounce;
  const tdToEarn = tradingDaysBetween(deps.today, ann.date, deps.cal);
  if (tdToEarn === null || tdToEarn < 0) return { ...UNKNOWN_IMPACT, expectedAnnounce: ann.date, announceMethod: ann.method };

  const width = cfg.conflictWindowTd + Math.round((ann.lagStdDays ?? 0) / 2);
  const reasons: string[] = [];
  let conflict: ConflictKind = "NONE";
  if (tdToEx !== null) {
    const gap = Math.abs(tdToEx - tdToEarn);
    if (gap <= width) {
      conflict = "NEAR_EX";
      reasons.push(`KQKD dự kiến cách GDKHQ ${gap} ngày giao dịch (ngưỡng ${width})`);
    } else if (window && window.exitOffset >= window.entryTo) {
      const earnOffset = tdToEarn - tdToEx;
      if (earnOffset >= window.entryTo && earnOffset <= window.exitOffset) {
        conflict = "INSIDE_HOLD";
        reasons.push("KQKD dự kiến rơi vào thời gian nắm giữ");
      }
    }
  }

  let scoreDelta: number | null = null;
  if (earnings.sue !== null && earnings.quality === "OK") scoreDelta = Math.max(-2, Math.min(2, earnings.sue / 2));

  let stance: EarningsStance = "NEUTRAL";
  if (conflict === "NEAR_EX") stance = "AVOID";
  else if (conflict === "INSIDE_HOLD") stance = "REDUCE_SIZE";
  else if (scoreDelta !== null && scoreDelta >= 1 && tdToEarn <= 7) stance = "FAVORABLE";
  else if (scoreDelta === null) stance = "UNKNOWN";
  if (ann.method === "DEADLINE_ONLY") reasons.push("Ngày công bố chỉ ước theo hạn pháp lý");

  return { expectedAnnounce: ann.date, announceMethod: ann.method, tdToEarnings: tdToEarn, conflict, scoreDelta, stance, reasons };
}

/** Cửa sổ đã chốt: khớp selectedWindowId VÀ có cờ selected (đã qua cổng thống kê). */
export function selectedWindow(stats: CycleStatsV3 | null): BacktestWindow | null {
  if (!stats || stats.selectedWindowId === null) return null;
  const w = stats.windows.find((x) => x.id === stats.selectedWindowId);
  return w && w.selected ? w : null;
}

export function optimizeDividendTiming(
  input: { exDate: Sourced<ISODate> | null; cycle: CycleStatsV3 | null; earnings: EarningsSignal | null },
  deps: TimingDeps,
): TimingRecommendation {
  const cfg = deps.cfg ?? DEFAULT_ENGINE_CONFIG;
  const tdToEx = tradingDaysBetween(deps.today, input.exDate?.value, deps.cal);
  const k = tdToEx === null ? null : -tdToEx; // k < 0 trước GDKHQ
  const win = selectedWindow(input.cycle);
  const earningsImpact = resolveEarningsImpact({ earnings: input.earnings, tdToEx, window: win }, deps);
  const base = { tdToEx, earningsImpact, dateStatus: input.exDate?.status ?? null };
  const empty = { window: null, expectedNetReturn: null, nEvents: null, confidence: null };

  if (tdToEx === null) return { action: "NO_DATE", ...empty, ...base };
  // Cửa sổ SAU GDKHQ (W4 +3..+6, W5 +20..+35): đợt vừa qua vẫn còn hiệu lực tới điểm thoát — không coi là POST_EX.
  const postExWindowLive = win !== null && win.entryFrom > 0 && k! <= win.exitOffset;
  if (tdToEx < 0 && !postExWindowLive) return { action: "POST_EX", ...empty, ...base };
  if (!win) return { action: "NO_SIGNAL", ...empty, ...base };

  let action: TimingAction;
  if (k! < win.entryFrom) action = "TOO_EARLY";
  else if (k! <= win.entryTo) action = "IN_WINDOW";
  else action = "WINDOW_PASSED";

  let confidence: Confidence =
    win.nEvents >= cfg.minEventsForHigh && (win.oosMeanNet ?? -1) > 0 ? "HIGH" : win.nEvents >= cfg.minEventsForMedium ? "MEDIUM" : "LOW";
  if (input.exDate?.status !== "CONFIRMED") confidence = downgrade(confidence);
  if (earningsImpact.conflict !== "NONE") confidence = downgrade(confidence);

  return {
    action,
    window: { id: win.id, label: win.label, entryFrom: win.entryFrom, entryTo: win.entryTo, exitOffset: win.exitOffset, holdsThroughEx: win.holdsThroughEx },
    expectedNetReturn: win.netExpectancyLcb,
    nEvents: win.nEvents,
    confidence,
    ...base,
  };
}

export interface DividendFrequency {
  medianMonths: number;
  cv: number;
  n: number;
  regularity: "REGULAR" | "IRREGULAR";
  confidence: number;
  nextExpected: ISODate | null;
  medianGapDays: number;
}

/** Chu kỳ chi cổ tức từ các ngày GDKHQ quá khứ (cần ≥ 3 đợt) — đợt kế tiếp = đợt cuối + trung vị khoảng cách. */
export function estimateDividendFrequency(exDates: ISODate[]): DividendFrequency | null {
  const days = exDates.map(toDayNumber).filter((d): d is number => d !== null).sort((a, b) => a - b);
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
  const cv = mean > 0 ? sd / mean : Infinity;
  const confidence = Math.max(0, Math.min(1, 1 - cv)) * Math.min(1, gaps.length / 6);
  return {
    medianMonths: median / 30.44, cv, n: gaps.length, regularity: cv <= 0.25 ? "REGULAR" : "IRREGULAR", confidence,
    nextExpected: dayNumberToIso(days[days.length - 1] + Math.round(median)), medianGapDays: median,
  };
}
