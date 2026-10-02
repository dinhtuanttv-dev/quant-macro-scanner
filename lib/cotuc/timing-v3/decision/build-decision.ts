/**
 * build-decision.ts — ghép mọi mảnh của gói cotuc-timing-engine (giai đoạn 4) thành MỘT ảnh
 * chụp quyết định cho một mã: optimizeDividendTiming → combineLogOdds (cổ tức + mùa vụ KQKD,
 * trọng số nhân theo chế độ thị trường) → buildEntryPlanSummary → computeDecisionState.
 * Hàm thuần (không I/O) — cron timing-signals-scan cấp dữ liệu thật (giá SSI, sự kiện VNDirect).
 *
 * Khác README của gói ở 2 chỗ, có chủ đích:
 *  - Xác suất cổ tức = trung bình hậu nghiệm Beta của tỷ lệ thắng (co về prior liên mã cùng cửa
 *    sổ), KHÔNG dùng 0,5 + lợi nhuận×5 (không phải xác suất).
 *  - liquidityOk nối dữ liệu thật: GTGD bình quân 20 phiên (giá khớp SSI × KL) ≥ 5 tỷ đồng.
 * learnSignalWeights / calibration KHÔNG dùng (chưa có đủ kết quả thực tế — xem HANDOFF.md).
 */
import { tradingDaysBetween, toDayNumber, dayNumberToIso, type HolidayCalendar, type ISODate } from "../date-utils";
import type { BacktestWindow, CycleStatsV3, EarningsCycleStatsV3, EarningsSignal, Sourced } from "../timing-types";
import { betaBinomialPosterior } from "../seasonality/beta-binomial";
import { classifyMarketRegime, REGIME_WEIGHT_MULTIPLIER, type RegimeResult } from "./market-regime";
import { combineLogOdds, type CombinedProbability, type WeightedSignal } from "./log-odds-combiner";
import { buildEntryPlanSummary, type EntryPlanSummary } from "./entry-refinement";
import { computeDecisionState } from "./compute-decision-state";
import type { CurvePoint, DecisionState } from "./decision-types";
import { estimateDividendFrequency, optimizeDividendTiming, selectedWindow, type TimingRecommendation } from "./optimize-dividend-timing";

export const DECISION_VERSION = "v3-p4";
/** Ngưỡng thanh khoản: GTGD bình quân 20 phiên ≥ 5 tỷ đồng/phiên. */
export const LIQUIDITY_MIN_VALUE_VND = 5e9;

export interface PricePoint { date: ISODate; adjClose: number }

export interface ResolvedExDate extends Sourced<ISODate> {
  /** Mô tả nguồn cho người dùng: "VNDirect (thông báo GDKHQ)" | "Ước tính theo chu kỳ …". */
  label: string;
}

/** Cộng/trừ n ngày giao dịch theo lịch (n âm = lùi). */
export function addTradingDays(iso: ISODate, n: number, cal: HolidayCalendar): ISODate {
  let d = toDayNumber(iso);
  if (d === null) throw new Error(`addTradingDays: ngày không hợp lệ ${iso}`);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let guard = 0;
  while (left > 0) {
    d += step;
    if (cal.isTradingDay(d)) left--;
    if (++guard > 5000) throw new Error("addTradingDays: vượt giới hạn lặp");
  }
  return dayNumberToIso(d);
}

/**
 * Ngày GDKHQ dùng cho quyết định: đợt đã có thông báo (VNDirect, ngày ≥ hôm nay) là CONFIRMED;
 * chưa có thì ƯỚC TÍNH theo chu kỳ chi lịch sử (trung vị khoảng cách, cần ≥ 3 đợt), cuộn tới
 * ≥ hôm nay — ESTIMATED nên điều kiện "ngày đã xác nhận" sẽ ✖ (tối đa WATCH).
 */
export function resolveUpcomingExDate(
  today: ISODate, announcedCashExDates: ISODate[], pastExDates: ISODate[], asOf: string, cal?: HolidayCalendar,
): ResolvedExDate | null {
  const upcoming = announcedCashExDates.filter((d) => d >= today).sort()[0];
  if (upcoming) return { value: upcoming, status: "CONFIRMED", source: "DERIVED", asOf, label: "VNDirect (thông báo GDKHQ)" };
  const past = [...new Set([...pastExDates, ...announcedCashExDates].filter((d) => d < today))].sort();
  const freq = estimateDividendFrequency(past);
  if (!freq || !freq.nextExpected || !(freq.medianGapDays >= 60)) return null;
  let next = toDayNumber(freq.nextExpected)!;
  const todayN = toDayNumber(today)!;
  while (next < todayN) next += Math.round(freq.medianGapDays);
  if (cal) while (!cal.isTradingDay(next)) next++; // ngày ước tính rơi vào T7/CN/lễ -> phiên kế tiếp
  return {
    value: dayNumberToIso(next), status: "ESTIMATED", source: "DERIVED", asOf,
    label: `Ước tính theo chu kỳ chi (trung vị ${freq.medianMonths.toFixed(1)} tháng, ${freq.n + 1} đợt)`,
  };
}

/** GTGD bình quân `n` phiên gần nhất (giá khớp danh nghĩa × khối lượng). null nếu thiếu dữ liệu. */
export function averageTradedValue(bars: { close: number; volume: number | null }[], n = 20): number | null {
  const rows = bars.filter((b) => b.close > 0 && typeof b.volume === "number" && b.volume >= 0).slice(-n);
  if (rows.length < Math.min(n, 10)) return null;
  return rows.reduce((a, b) => a + b.close * (b.volume as number), 0) / rows.length;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Phân vị CAR lịch sử tại một offset (từ eventPaths của computeCyclePaths), cần ≥ 5 đợt. */
export function curvePointAt(offsets: number[], eventPaths: { car: (number | null)[] }[], offset: number): CurvePoint | undefined {
  const idx = offsets.indexOf(offset);
  if (idx < 0) return undefined;
  const vals = eventPaths.map((p) => p.car[idx]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (vals.length < 5) return undefined;
  return { offset, n: vals.length, p5: quantile(vals, 0.05), p25: quantile(vals, 0.25), p75: quantile(vals, 0.75), p95: quantile(vals, 0.95) };
}

function priceOnOrBefore(series: PricePoint[], date: ISODate): PricePoint | null {
  let lo = 0, hi = series.length - 1, ans: PricePoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) { ans = series[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Ngày giao dịch chung mới nhất của mã và VN-Index (≤ hôm nay). */
export function lastCommonDate(stock: PricePoint[], bench: PricePoint[], today: ISODate): ISODate | null {
  const b = new Set(bench.filter((p) => p.date <= today).map((p) => p.date));
  for (let i = stock.length - 1; i >= 0; i--) if (stock[i].date <= today && b.has(stock[i].date)) return stock[i].date;
  return null;
}

/** CAR (log, đã trừ VN-Index) giữa hai ngày; null nếu thiếu giá đúng hai ngày đó. */
export function carBetween(stock: PricePoint[], bench: PricePoint[], from: ISODate, to: ISODate): number | null {
  const s0 = priceOnOrBefore(stock, from), s1 = priceOnOrBefore(stock, to);
  const b0 = priceOnOrBefore(bench, from), b1 = priceOnOrBefore(bench, to);
  if (!s0 || !s1 || !b0 || !b1 || s0.date !== b0.date || s1.date !== b1.date) return null;
  if (s0.adjClose <= 0 || s1.adjClose <= 0 || b0.adjClose <= 0 || b1.adjClose <= 0) return null;
  return Math.log(s1.adjClose / s0.adjClose) - Math.log(b1.adjClose / b0.adjClose);
}

export interface SignalNote { name: string; used: boolean; probability: number | null; weight: number; detail: string }

export interface DecisionSnapshot {
  version: string;
  ticker: string;
  asOf: ISODate;
  priceDate: ISODate | null;
  exDate: ResolvedExDate | null;
  recommendation: TimingRecommendation;
  decision: DecisionState;
  combined: CombinedProbability;
  signals: SignalNote[];
  regime: Omit<RegimeResult, "currentVolatility"> & { currentVolatility: number | null };
  entryPlan: EntryPlanSummary;
  currentCar: number | null;
  liquidity: { avgValue20: number | null; threshold: number; ok: boolean | null };
  earnings: { quarterLabel: string; expectedAnnounce: ISODate; tdToEarnings: number | null } | null;
  disclaimer: "NOT_INVESTMENT_ADVICE";
}

export interface BuildDecisionInput {
  ticker: string;
  today: ISODate;
  cal: HolidayCalendar;
  stats: CycleStatsV3;
  offsets: number[];
  eventPaths: { exDate: ISODate; car: (number | null)[] }[];
  stockPrices: PricePoint[];
  benchmarkPrices: PricePoint[];
  exDate: ResolvedExDate | null;
  earnings: EarningsSignal | null;
  /** Thống kê mùa vụ của QUÝ mà `earnings` nhắm tới. */
  earningsStats: EarningsCycleStatsV3 | null;
  avgValue20: number | null;
  /** Prior Beta liên mã cho tỷ lệ thắng của từng cửa sổ (theo id). Thiếu ⇒ Beta(1,1). */
  dividendPriors?: Record<string, { alpha0: number; beta0: number }>;
  /** Kết quả phân loại thị trường (tính MỘT lần cho cả lô từ VN-Index). Thiếu ⇒ tự tính. */
  regime?: RegimeResult;
}

const NO_ENTRY_PLAN: EntryPlanSummary = {
  tranches: [], runTooFar: { percentile: null, hasRunTooFar: false }, invalidationLevel: null, invalidated: false, timeStopped: false, pauseFurtherEntries: false,
};

function pct(v: number) { return `${Math.round(v * 100)}%`; }

export function buildDecisionSnapshot(input: BuildDecisionInput): DecisionSnapshot {
  const { ticker, today, cal, stats, offsets, eventPaths, stockPrices, benchmarkPrices, exDate, earnings, earningsStats } = input;
  const regime = input.regime ?? classifyMarketRegime({ closes: benchmarkPrices.filter((p) => p.date <= today).map((p) => p.adjClose) });
  const mult = REGIME_WEIGHT_MULTIPLIER[regime.regime];

  const rec = optimizeDividendTiming({ exDate, cycle: stats, earnings }, { today, cal });
  const win: BacktestWindow | null = selectedWindow(stats);
  const k = rec.tdToEx === null ? null : -rec.tdToEx;
  const priceDate = lastCommonDate(stockPrices, benchmarkPrices, today);

  // --- tín hiệu thành phần ---
  const signals: SignalNote[] = [];
  const weighted: WeightedSignal[] = [];
  if (win && rec.window) {
    const wins = Math.round(win.winRate * win.nEvents);
    const prior = input.dividendPriors?.[win.id] ?? { alpha0: 1, beta0: 1 };
    const post = betaBinomialPosterior(wins, win.nEvents - wins, prior.alpha0, prior.beta0);
    const weight = win.nEvents * mult;
    weighted.push({ name: "Cổ tức", probability: post.mean, weight });
    signals.push({ name: "Cổ tức", used: true, probability: post.mean, weight,
      detail: `${win.label}: thắng ${wins}/${win.nEvents} đợt → hậu nghiệm Beta ${pct(post.mean)} (CI90 ${pct(post.ci[0])}–${pct(post.ci[1])})` });
  } else {
    signals.push({ name: "Cổ tức", used: false, probability: null, weight: 0, detail: "Không có cửa sổ cổ tức qua cổng thống kê" });
  }

  let earningsInfo: DecisionSnapshot["earnings"] = null;
  if (earnings) {
    const tdToEarn = tradingDaysBetween(today, earnings.expectedAnnounce.date, cal);
    earningsInfo = { quarterLabel: earnings.quarterLabel, expectedAnnounce: earnings.expectedAnnounce.date, tdToEarnings: tdToEarn };
    const ew = earningsStats ? selectedWindow(earningsStats as unknown as CycleStatsV3) : null;
    const rp = earningsStats?.reactionProbability ?? null;
    // Chỉ dùng mùa vụ KQKD khi ngày công bố rơi vào khoảng từ hôm nay tới điểm thoát dự kiến.
    const inHold = rec.window && rec.tdToEx !== null && tdToEarn !== null && tdToEarn >= 0 && tdToEarn - rec.tdToEx <= rec.window.exitOffset;
    if (inHold && ew && rp) {
      const weight = ew.nEvents * mult;
      weighted.push({ name: "Mùa vụ KQKD", probability: rp.mean, weight });
      signals.push({ name: "Mùa vụ KQKD", used: true, probability: rp.mean, weight, detail: `${earnings.quarterLabel} · ${ew.label}: P(phản ứng dương) ${pct(rp.mean)}` });
    } else {
      signals.push({ name: "Mùa vụ KQKD", used: false, probability: rp?.mean ?? null, weight: 0,
        detail: !inHold ? `KQKD ${earnings.quarterLabel} (dự kiến ${earnings.expectedAnnounce.date}) không rơi vào thời gian nắm giữ` : `${earnings.quarterLabel}: chưa có cửa sổ mùa vụ đạt kiểm định (cần ≥ 8 kỳ)` });
    }
  } else {
    signals.push({ name: "Mùa vụ KQKD", used: false, probability: null, weight: 0, detail: "Chưa có tín hiệu KQKD" });
  }
  const combined = combineLogOdds(weighted);

  // --- điểm vào: giá đã chạy trước chưa (CAR đợt hiện tại so với lịch sử cùng offset) ---
  let currentCar: number | null = null;
  let entryPlan = NO_ENTRY_PLAN;
  if (rec.window && exDate && k !== null) {
    let curvePoint: CurvePoint | undefined;
    if (priceDate && k >= offsets[0]) {
      const baseDate = addTradingDays(exDate.value, offsets[0], cal);
      if (baseDate <= priceDate) currentCar = carBetween(stockPrices, benchmarkPrices, baseDate, priceDate);
      const nearest = offsets.reduce((best, o) => (Math.abs(o - k) < Math.abs(best - k) ? o : best), offsets[0]);
      curvePoint = curvePointAt(offsets, eventPaths, nearest);
    }
    entryPlan = buildEntryPlanSummary({
      entryFrom: rec.window.entryFrom, entryTo: rec.window.entryTo, exitOffset: rec.window.exitOffset, currentOffset: k,
      ...(currentCar !== null ? { currentCarValue: currentCar, curvePointAtCurrentOffset: curvePoint } : {}),
    });
  }

  const liquidityOk = input.avgValue20 === null ? null : input.avgValue20 >= LIQUIDITY_MIN_VALUE_VND;
  const decision = computeDecisionState({
    action: rec.action, combined, entryPlan, marketRegime: regime.regime, dateStatus: rec.dateStatus,
    earningsConflict: rec.earningsImpact.conflict, liquidityOk,
  });
  // Chi tiết thanh khoản bằng số thật (computeDecisionState chỉ biết Đủ/Thấp).
  const liq = decision.checks.find((c) => c.key === "liquidity");
  if (liq && input.avgValue20 !== null) liq.detail = `${liquidityOk ? "Đủ" : "Thấp"} — GTGD bình quân 20 phiên ${(input.avgValue20 / 1e9).toFixed(1)} tỷ (ngưỡng 5 tỷ)`;
  const reg = decision.checks.find((c) => c.key === "marketRegime");
  if (reg && regime.reasons.length) reg.detail = `${reg.detail} — ${regime.reasons.join("; ")}`;
  const dt = decision.checks.find((c) => c.key === "dateConfirmed");
  if (dt && exDate) dt.detail = `${dt.detail}: ${exDate.value} · ${exDate.label}`;

  return {
    version: DECISION_VERSION, ticker, asOf: today, priceDate, exDate, recommendation: rec, decision, combined, signals,
    regime: { regime: regime.regime, belowMa: regime.belowMa, currentVolatility: regime.currentVolatility, volatilityPercentile: regime.volatilityPercentile, reasons: regime.reasons },
    entryPlan, currentCar,
    liquidity: { avgValue20: input.avgValue20, threshold: LIQUIDITY_MIN_VALUE_VND, ok: liquidityOk },
    earnings: earningsInfo, disclaimer: "NOT_INVESTMENT_ADVICE",
  };
}
