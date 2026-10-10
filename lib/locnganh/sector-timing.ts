/**
 * lib/locnganh/sector-timing.ts — điều phối engine xoay vòng ngành (L2) cho TOÀN BỘ ngành ICB của Gateway (hàm thuần, không I/O).
 *
 * Mỗi ngành:
 *   1. Lịch sử RRG tuần (Gateway sector-rrg/L1, đã lọc nhiễu, chỉ tuần đã đóng) -> RRGPoint[] -> detectQuadrantTransitions
 *      (sự kiện = lần chuyển VÀO Improving).
 *   2. computeSectorCycleStats: lợi suất vượt trội của chỉ số ngành so VN-Index quanh ngày chuyển góc (CAR theo ngày giao dịch),
 *      6 cửa sổ ứng viên vào sau sự kiện, co về prior LIÊN NGÀNH cùng nhóm ICB cấp 1 (leave-one-out), cổng FDR / cận dưới /
 *      walk-forward của backtest engine đang chạy (lib/cotuc/timing-v3), xác suất outperform Beta-Binomial.
 *   3. Hành động theo số phiên kể từ lần chuyển gần nhất (TOO_EARLY / IN_WINDOW / WINDOW_PASSED / POST_EX / NO_SIGNAL / NO_DATE).
 *   4. fuseSectorSignals (xác suất lịch sử + Confluence Score ngành + chế độ thị trường macro Risk-On × MA200 VN-Index)
 *      -> computeSectorDecisionState (FAVORABLE / WATCH / AVOID), entry plan (chia 3 đợt, "đã chạy trước", vô hiệu ATR).
 * Kiểm định đặt trước (L3) chưa chạy -> nhãn EXPERIMENTAL.
 */
import { computeCyclePaths, type PricePoint } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import type { HolidayCalendar } from "@/lib/cotuc/timing-v3/date-utils";
import { makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";
import { buildEntryPlanSummary, type EntryPlanSummary } from "@/lib/cotuc/timing-v3/decision/entry-refinement";
import type { CurvePoint, DecisionState } from "@/lib/cotuc/timing-v3/decision/decision-types";
import { detectQuadrantTransitions } from "./detect-quadrant-transitions";
import { buildEventSamplesFromPaths, computeIndustryGroupPrior, computeSectorCycleStats, type SectorWindowDef } from "./compute-sector-cycle-stats";
import { fuseSectorSignals } from "./sector-regime-fusion";
import { computeSectorDecisionState } from "./compute-sector-decision-state";
import { scanSectorOpportunities } from "./scan-sector-opportunities";
import type { ConfluenceStock, MacroRegime, Quadrant, RRGPoint, SectorCycleStatsV3, SectorOpportunity, SectorTimingAction, SectorTimingSignal } from "./sector-types";

export const SECTOR_TIMING_VERSION = "locnganh-timing/L2";
export const TARGET_QUADRANT: Quadrant = "IMPROVING";
/** Cửa sổ ứng viên: vào trong [entryFrom, entryTo] phiên SAU ngày chuyển vào Improving, thoát tại exitOffset. */
export const SECTOR_WINDOWS: SectorWindowDef[] = [
  { id: "E1-3_X10", label: "Vào 1–3, thoát +10", entryFrom: 1, entryTo: 3, exitOffset: 10 },
  { id: "E1-3_X20", label: "Vào 1–3, thoát +20", entryFrom: 1, entryTo: 3, exitOffset: 20 },
  { id: "E1-5_X20", label: "Vào 1–5, thoát +20", entryFrom: 1, entryTo: 5, exitOffset: 20 },
  { id: "E1-5_X40", label: "Vào 1–5, thoát +40", entryFrom: 1, entryTo: 5, exitOffset: 40 },
  { id: "E3-8_X40", label: "Vào 3–8, thoát +40", entryFrom: 3, entryTo: 8, exitOffset: 40 },
  { id: "E1-5_X60", label: "Vào 1–5, thoát +60", entryFrom: 1, entryTo: 5, exitOffset: 60 },
];
/** Cửa sổ tham chiếu dùng để ước lượng prior liên ngành (một prior chung cho mọi cửa sổ của ngành — xem compute-sector-cycle-stats). */
const PRIOR_WINDOW = SECTOR_WINDOWS[2];
const PATH_OFFSETS = Array.from({ length: 71 }, (_, i) => i - 10); // -10..60 cho CycleTimeline

export interface GatewaySectorHistory {
  code: string; level: number; name: string;
  rrg: { week: string; date: string; ratio: number; momentum: number; quadrant: Quadrant }[];
  index: [string, number, number][];
}
export interface GatewaySectorSummary { code: string; level: number; name: string; parent: string | null; quadrant: Quadrant; liveQuadrant: Quadrant; indexMembers: number; thin?: boolean; constituents?: { ticker: string; weight: number }[] }

export interface SectorTimingInput {
  summaries: GatewaySectorSummary[];
  histories: Map<string, GatewaySectorHistory>;
  /** Ngành cấp 2 -> mã nhóm cấp 1 (prior liên ngành cùng nhóm). */
  l1Of: Map<string, string | null>;
  bench: PricePoint[];
  closedThrough: string | null;
  asOf: string;
  macroRegime: MacroRegime;
  /** Confluence Score trung bình của ngành (Top 20 Lọc ngành, theo ICB) — null nếu chưa có. */
  confluenceBySector?: Map<string, number>;
  /** Lịch giao dịch VN (quy tắc + ngày nghỉ quan sát của Gateway) — biết cả ngày TƯƠNG LAI, nên dịch offset quanh lần chuyển
   *  góc gần đây không vượt phạm vi dữ liệu (lịch suy từ giá chỉ biết ngày đã có giá -> addTradingDays dừng an toàn & ném lỗi). */
  cal?: HolidayCalendar;
}

export interface SectorTimingDetail {
  code: string; name: string; level: number;
  stats: SectorCycleStatsV3;
  paths: { offsets: number[]; eventPaths: { exDate: string; car: (number | null)[] }[]; currentPath: (number | null)[] | null };
  decision: DecisionState; entryPlan: EntryPlanSummary | null; curveAtCurrent: CurvePoint | null;
  rrg: GatewaySectorHistory["rrg"];
}
export type SectorTimingSignalV2 = SectorTimingSignal & {
  name: string; level: number; group: string | null; quadrant: Quadrant; liveQuadrant: Quadrant; indexMembers: number; thin: boolean;
  lastTransitionDate: string | null; expectedNetReturnLcb: number | null; decision: DecisionState; confluenceScore: number | null;
};

const toPoints = (h: GatewaySectorHistory, closedThrough: string | null): RRGPoint[] =>
  h.rrg.filter((r) => !closedThrough || r.week <= closedThrough).map((r) => ({ sectorKey: h.code, sectorLabel: h.name, rsRatio: r.ratio, rsMomentum: r.momentum, quadrant: r.quadrant, asOf: r.date }));

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Số phiên giao dịch (theo lịch VN-Index) SAU `from` tới hết `to`. */
export function sessionsBetween(dates: string[], from: string, to: string): number {
  let n = 0; for (const d of dates) if (d > from && d <= to) n++; return n;
}

export function actionFor(t: number | null, window: { entryFrom: number; entryTo: number; exitOffset: number } | null, hasSignal: boolean): SectorTimingAction {
  if (t === null) return "NO_DATE";
  if (!hasSignal || !window) return "NO_SIGNAL";
  if (t < window.entryFrom) return "TOO_EARLY";
  if (t <= window.entryTo) return "IN_WINDOW";
  if (t < window.exitOffset) return "WINDOW_PASSED";
  return "POST_EX";
}

export function confidenceOf(q: number | null, n: number | null): "HIGH" | "MEDIUM" | "LOW" | null {
  if (q === null || n === null) return null;
  if (q < 0.05 && n >= 15) return "HIGH";
  if (q < 0.1 && n >= 8) return "MEDIUM";
  return "LOW";
}

export function computeSectorTiming(input: SectorTimingInput): { signals: SectorTimingSignalV2[]; details: Map<string, SectorTimingDetail>; opportunities: SectorOpportunity[] } {
  const { summaries, histories, bench, closedThrough, asOf } = input;
  const benchDates = bench.map((b) => b.date);
  const vnCloses = bench.map((b) => b.adjClose);
  const prep = new Map<string, { h: GatewaySectorHistory; points: RRGPoint[]; prices: PricePoint[]; transitions: ReturnType<typeof detectQuadrantTransitions> }>();
  for (const s of summaries) {
    const h = histories.get(s.code); if (!h) continue;
    const points = toPoints(h, closedThrough);
    prep.set(s.code, { h, points, prices: h.index.map(([date, close]) => ({ date, adjClose: close })), transitions: detectQuadrantTransitions(points, TARGET_QUADRANT) });
  }
  const vnCal = input.cal ?? makeVnTradingCalendar(null);
  const calOf = (_prices: PricePoint[]) => vnCal;
  // Lượt 1: mẫu sự kiện của mỗi ngành tại cửa sổ tham chiếu (cho prior liên ngành cùng nhóm, leave-one-out)
  const refSamples = new Map<string, ReturnType<typeof buildEventSamplesFromPaths>>();
  for (const [code, p] of prep) {
    if (!p.transitions.length) { refSamples.set(code, []); continue; }
    const paths = computeCyclePaths({ ticker: code, stockPrices: p.prices, benchmarkPrices: bench, events: p.transitions.map((t) => ({ exDate: t.date })), offsets: [PRIOR_WINDOW.entryFrom, PRIOR_WINDOW.exitOffset], cal: calOf(p.prices), version: SECTOR_TIMING_VERSION, asOf });
    refSamples.set(code, buildEventSamplesFromPaths(paths.offsets, paths.eventPaths, PRIOR_WINDOW.entryFrom, PRIOR_WINDOW.exitOffset));
  }
  const groupKey = (s: GatewaySectorSummary) => `${s.level}|${s.level === 2 ? input.l1Of.get(s.code) ?? "?" : input.l1Of.get(s.parent ?? "") ?? s.parent ?? "?"}`;
  const signals: SectorTimingSignalV2[] = [], details = new Map<string, SectorTimingDetail>(), scanInputs: { sectorKey: string; stats: SectorCycleStatsV3 }[] = [];
  for (const s of summaries) {
    const p = prep.get(s.code); if (!p) continue;
    const peers = summaries.filter((o) => o.code !== s.code && groupKey(o) === groupKey(s)).map((o) => refSamples.get(o.code) ?? []);
    // không có ngành cùng nhóm -> prior từ mọi ngành cùng cấp (vẫn leave-one-out)
    const prior = computeIndustryGroupPrior(peers.some((x) => x.length) ? peers : summaries.filter((o) => o.code !== s.code && o.level === s.level).map((o) => refSamples.get(o.code) ?? []));
    const cal = calOf(p.prices);
    const stats = computeSectorCycleStats({ sectorKey: s.code, targetQuadrant: TARGET_QUADRANT, transitions: p.transitions, sectorPrices: p.prices, benchmarkPrices: bench, windowDefs: SECTOR_WINDOWS, cal, prior, version: SECTOR_TIMING_VERSION, asOf });
    const last = p.transitions.at(-1) ?? null;
    const paths = last
      ? computeCyclePaths({ ticker: s.code, stockPrices: p.prices, benchmarkPrices: bench, events: p.transitions.map((t) => ({ exDate: t.date })), offsets: PATH_OFFSETS, cal, currentExDate: last.date, version: SECTOR_TIMING_VERSION, asOf })
      : null;
    const sel = stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected) ?? null;
    const t = last ? sessionsBetween(benchDates, last.date, asOf) : null;
    const action = actionFor(t, sel, Boolean(sel && stats.reactionProbability));
    // entry plan: phân vị CAR lịch sử tại offset hiện tại + vô hiệu hoá theo ATR của chỉ số ngành
    let entryPlan: EntryPlanSummary | null = null, curve: CurvePoint | null = null;
    if (sel && paths && t !== null) {
      const k = paths.offsets.indexOf(Math.min(t, 60));
      const cars = paths.eventPaths.map((e) => e.car[k]).filter((v): v is number => v !== null && Number.isFinite(v));
      curve = k >= 0 && cars.length ? { offset: paths.offsets[k], n: cars.length, mean: cars.reduce((a, b) => a + b, 0) / cars.length, p5: quantile(cars, 0.05), p25: quantile(cars, 0.25), p75: quantile(cars, 0.75), p95: quantile(cars, 0.95) } : null;
      const cur = k >= 0 ? paths.currentPath?.[k] ?? undefined : undefined;
      const ix = p.prices, iEntry = ix.findIndex((x) => x.date > last!.date);
      const entryIdx = iEntry >= 0 ? Math.min(ix.length - 1, iEntry + sel.entryFrom - 1) : -1;
      const tr: number[] = []; for (let i = Math.max(1, ix.length - 15); i < ix.length; i++) tr.push(Math.abs(ix[i].adjClose - ix[i - 1].adjClose));
      entryPlan = buildEntryPlanSummary({
        entryFrom: sel.entryFrom, entryTo: sel.entryTo, exitOffset: sel.exitOffset, currentOffset: t,
        currentCarValue: cur ?? undefined, curvePointAtCurrentOffset: curve ?? undefined,
        entryPrice: entryIdx >= 0 && t >= sel.entryFrom ? ix[entryIdx].adjClose : undefined, atr: tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : undefined,
        currentPrice: ix.at(-1)?.adjClose,
      });
    }
    const conf = input.confluenceBySector?.get(s.code) ?? null;
    const fused = fuseSectorSignals({
      reactionProbability: stats.reactionProbability?.mean ?? null, reactionProbabilityNEvents: sel?.nEvents ?? 0,
      confluence: conf !== null ? ({ confluenceScore: conf } as ConfluenceStock) : null, macroRegime: input.macroRegime, vnIndexCloses: vnCloses,
    });
    const pr = stats.reactionProbability?.mean ?? null;
    const decision = computeSectorDecisionState({
      action, combined: fused.combined,
      entryPlan: entryPlan ?? { tranches: [], runTooFar: { percentile: null, hasRunTooFar: false }, invalidationLevel: null, invalidated: false, timeStopped: false, pauseFurtherEntries: false },
      marketRegime: fused.marketRegime, transitionDateConfirmed: true,
      // chưa có xác suất lịch sử -> "không mâu thuẫn" khi Confluence kỹ thuật không tiêu cực (≥ 50); không có Confluence -> chưa biết
      confluenceCorroborates: conf === null ? null : pr === null ? conf >= 50 : (conf >= 50) === (pr >= 0.5),
      liquidityOk: s.thin ? false : null,
    });
    signals.push({
      sectorKey: s.code, action, tdSinceTransition: t,
      window: sel ? { entryFrom: sel.entryFrom, entryTo: sel.entryTo, exitOffset: sel.exitOffset } : null,
      expectedNetReturn: sel ? sel.netExpectancy : null, expectedNetReturnLcb: sel ? sel.netExpectancyLcb : null,
      nEvents: sel ? sel.nEvents : p.transitions.length, fdrQValue: sel ? sel.fdrQValue : null, confidence: sel ? confidenceOf(sel.fdrQValue, sel.nEvents) : null,
      reactionProbability: stats.reactionProbability ? { mean: stats.reactionProbability.mean, ci: stats.reactionProbability.ci } : null,
      name: s.name, level: s.level, group: groupKey(s).split("|")[1], quadrant: s.quadrant, liveQuadrant: s.liveQuadrant, indexMembers: s.indexMembers, thin: Boolean(s.thin),
      lastTransitionDate: last?.date ?? null, decision, confluenceScore: conf,
    });
    details.set(s.code, { code: s.code, name: s.name, level: s.level, stats, paths: paths ? { offsets: paths.offsets, eventPaths: paths.eventPaths, currentPath: paths.currentPath } : { offsets: [], eventPaths: [], currentPath: null }, decision, entryPlan, curveAtCurrent: curve, rrg: p.h.rrg.slice(-26) });
    scanInputs.push({ sectorKey: s.code, stats });
  }
  return { signals, details, opportunities: scanSectorOpportunities(scanInputs, { minLowerBound: 0.5 }) };
}
