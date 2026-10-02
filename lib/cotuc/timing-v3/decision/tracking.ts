/**
 * tracking.ts — theo dõi tín hiệu thực tế (giai đoạn 4 của gói), phần THUẦN. Tầng DB nằm ở
 * cron timing-signals-scan và route /api/cotuc/signal-tracking.
 *
 * Quy tắc ghi:
 *  - Ghi MỘT bản ghi khi mã lần đầu vào vùng mua (action IN_WINDOW) với trạng thái FAVORABLE hoặc
 *    WATCH — bỏ qua nếu mã đó đã có bản ghi cùng cửa sổ chưa có kết quả, hoặc phát trong 120 ngày qua.
 *  - Xác suất ghi lại = xác suất tổng hợp đang hiển thị trên DecisionBar (chưa hiệu chỉnh).
 *  - Kết quả: khi giá đã có tới ngày thoát dự kiến, CAR thực = ln(giá mã) − ln(VN-Index) từ ngày
 *    ghi tới ngày thoát (chuỗi tổng lợi suất SSI); outcome = 1 nếu CAR > 0.
 *    Giá KHÔNG lưu lại lúc ghi vì chuỗi điều chỉnh lùi đổi mức giá khi có sự kiện quyền mới —
 *    tỷ số giữa hai ngày trong cùng một chuỗi thì không đổi.
 * Tóm tắt: dùng nguyên signal-tracking-log của gói (rollingAccuracy, Brier, CUSUM hai phía).
 * CUSUM giám sát tỷ lệ đúng THỰC so với xác suất TRUNG BÌNH đã báo — báo động LOW nghĩa là mô
 * hình đang tự tin hơn thực tế.
 */
import type { ISODate, HolidayCalendar } from "../date-utils";
import { addTradingDays, carBetween, type DecisionSnapshot, type PricePoint } from "./build-decision";
import { brierScoreFromStore, createTrackingStore, recordOutcome, recordSignal, rollingAccuracy, type CusumState } from "./signal-tracking-log";
import type { DecisionLevel } from "./decision-types";

export interface TrackRow {
  id: string;
  ticker: string;
  windowId: string;
  level: DecisionLevel;
  predictedProbability: number;
  components: { name: string; logOdds: number }[];
  exDate: ISODate;
  exDateStatus: string;
  entryDate: ISODate;
  plannedExitDate: ISODate;
  issuedAt: string;
  outcome: 0 | 1 | null;
  realizedCar: number | null;
  exitDate: ISODate | null;
  outcomeRecordedAt: string | null;
}

const REISSUE_GAP_DAYS = 120;

/** Bản ghi mới cần tạo cho ảnh chụp này (hoặc null). */
export function planIssue(snap: DecisionSnapshot, existing: TrackRow[], cal: HolidayCalendar, nowIso: string): TrackRow | null {
  const rec = snap.recommendation;
  if (rec.action !== "IN_WINDOW" || !rec.window || !snap.exDate || !snap.priceDate) return null;
  if (snap.decision.level === "AVOID") return null;
  const win = rec.window;
  const cutoff = new Date(Date.parse(snap.asOf) - REISSUE_GAP_DAYS * 86_400_000).toISOString();
  const dup = existing.some((r) => r.ticker === snap.ticker && r.windowId === win.id && (r.outcome === null || r.issuedAt >= cutoff));
  if (dup) return null;
  return {
    id: `${snap.ticker}:${win.id}:${snap.priceDate}`,
    ticker: snap.ticker,
    windowId: win.id,
    level: snap.decision.level,
    predictedProbability: snap.decision.combinedProbability,
    components: snap.combined.contributions.map((c) => ({ name: c.name, logOdds: c.logOdds })),
    exDate: snap.exDate.value,
    exDateStatus: snap.exDate.status,
    entryDate: snap.priceDate,
    plannedExitDate: addTradingDays(snap.exDate.value, win.exitOffset, cal),
    issuedAt: nowIso,
    outcome: null, realizedCar: null, exitDate: null, outcomeRecordedAt: null,
  };
}

export interface ResolvedOutcome { id: string; outcome: 0 | 1; realizedCar: number; exitDate: ISODate }

/** Kết quả cho các bản ghi đã tới ngày thoát (chỉ dùng giá đã có — không ngoại suy). */
export function planResolutions(open: TrackRow[], stock: PricePoint[], bench: PricePoint[]): ResolvedOutcome[] {
  const lastStock = stock[stock.length - 1]?.date;
  const lastBench = bench[bench.length - 1]?.date;
  if (!lastStock || !lastBench) return [];
  const out: ResolvedOutcome[] = [];
  for (const r of open) {
    if (r.outcome !== null) continue;
    if (lastStock < r.plannedExitDate || lastBench < r.plannedExitDate) continue;
    const exitDate = stock.find((p) => p.date >= r.plannedExitDate)?.date;
    if (!exitDate) continue;
    const car = carBetween(stock, bench, r.entryDate, exitDate);
    if (car === null) continue;
    out.push({ id: r.id, outcome: car > 0 ? 1 : 0, realizedCar: car, exitDate });
  }
  return out;
}

export interface TrackingSummary {
  totalSignals: number;
  resolvedSignals: number;
  rollingAccuracy: number | null;
  rollingWindowSize?: number;
  brierScore: number | null;
  cusum: CusumState;
  /** Xác suất trung bình đã báo trên các tín hiệu đã có kết quả (mục tiêu CUSUM). */
  meanPredicted: number | null;
  byLevel: { level: DecisionLevel; total: number; resolved: number; hitRate: number | null }[];
}

export const ROLLING_WINDOW = 20;

export function summarizeTracking(rows: TrackRow[]): TrackingSummary {
  const store = createTrackingStore();
  const sorted = [...rows].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  for (const r of sorted) {
    recordSignal(store, { id: r.id, ticker: r.ticker, predictedProbability: r.predictedProbability, issuedAt: r.issuedAt, components: r.components });
  }
  const resolved = sorted.filter((r) => r.outcome !== null);
  const meanPredicted = resolved.length ? resolved.reduce((a, r) => a + r.predictedProbability, 0) / resolved.length : null;
  const byResolution = [...resolved].sort((a, b) => (a.outcomeRecordedAt ?? a.issuedAt).localeCompare(b.outcomeRecordedAt ?? b.issuedAt));
  for (const r of byResolution) {
    recordOutcome(store, r.id, r.outcome as 0 | 1, r.outcomeRecordedAt ?? r.issuedAt, { cusumTarget: meanPredicted ?? 0.5 });
  }
  const levels: DecisionLevel[] = ["FAVORABLE", "WATCH"];
  return {
    totalSignals: rows.length,
    resolvedSignals: resolved.length,
    rollingAccuracy: rollingAccuracy(store, ROLLING_WINDOW),
    rollingWindowSize: ROLLING_WINDOW,
    brierScore: brierScoreFromStore(store),
    cusum: store.cusum,
    meanPredicted,
    byLevel: levels.map((level) => {
      const all = rows.filter((r) => r.level === level);
      const res = all.filter((r) => r.outcome !== null);
      return { level, total: all.length, resolved: res.length, hitRate: res.length ? res.reduce((a, r) => a + (r.outcome as number), 0) / res.length : null };
    }),
  };
}
