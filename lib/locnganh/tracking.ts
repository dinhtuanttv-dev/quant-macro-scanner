/**
 * lib/locnganh/tracking.ts — sổ theo dõi tín hiệu NGÀNH thực tế (phần thuần). Tầng DB: cron sector-timing-scan (ghi) và route
 * /api/locnganh/signal-tracking (đọc). Cùng quy tắc với sổ Cổ tức (lib/cotuc/timing-v3/decision/tracking.ts):
 *  - Ghi MỘT bản ghi khi ngành vào vùng mua (IN_WINDOW) với quyết định FAVORABLE hoặc WATCH; bỏ qua nếu ngành đã có bản ghi cùng
 *    cửa sổ chưa có kết quả hoặc phát trong 120 ngày qua. Xác suất ghi = xác suất tổng hợp đang hiển thị (chưa hiệu chỉnh).
 *  - Kết quả: khi đã có giá tới ngày thoát dự kiến, CAR thực = ln(chỉ số ngành) − ln(VN-Index) từ ngày ghi tới ngày thoát;
 *    outcome = 1 nếu CAR > 0. Không lưu giá lúc ghi (tỷ số hai ngày trong cùng chuỗi không đổi).
 *  - Tóm tắt: dùng nguyên summarizeTracking (rollingAccuracy, Brier, CUSUM hai phía).
 */
import type { PricePoint } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import { summarizeTracking, type TrackRow, type TrackingSummary } from "@/lib/cotuc/timing-v3/decision/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";
import type { SectorTimingSignalV2 } from "./sector-timing";

export interface SectorTrackRow {
  id: string; sectorCode: string; windowId: string; level: DecisionLevel; predictedProbability: number;
  components: { name: string; logOdds: number }[]; transitionDate: string; entryDate: string; plannedExitDate: string;
  issuedAt: string; outcome: 0 | 1 | null; realizedCar: number | null; exitDate: string | null; outcomeRecordedAt: string | null;
}

const REISSUE_GAP_DAYS = 120;

/** Ngày giao dịch thứ `n` sau `from` theo lịch `dates` (tăng dần); vượt dữ liệu -> ước theo ngày thường (T2–T6). */
export function sessionAfter(dates: string[], from: string, n: number): string {
  const k = dates.findIndex((d) => d > from);
  if (k >= 0 && k + n - 1 < dates.length) return dates[k + n - 1];
  let d = new Date(`${(k >= 0 ? dates.at(-1)! : from)}T00:00:00Z`), left = k >= 0 ? n - (dates.length - k) : n;
  while (left > 0) { d = new Date(d.getTime() + 86_400_000); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

export function planSectorIssue(sig: SectorTimingSignalV2, windowId: string | null, existing: SectorTrackRow[], benchDates: string[], asOf: string, nowIso: string): SectorTrackRow | null {
  if (sig.action !== "IN_WINDOW" || !sig.window || !windowId || !sig.lastTransitionDate) return null;
  if (sig.decision.level === "AVOID") return null;
  const cutoff = new Date(Date.parse(asOf) - REISSUE_GAP_DAYS * 86_400_000).toISOString();
  if (existing.some((r) => r.sectorCode === sig.sectorKey && r.windowId === windowId && (r.outcome === null || r.issuedAt >= cutoff))) return null;
  return {
    id: `${sig.sectorKey}:${windowId}:${asOf}`, sectorCode: sig.sectorKey, windowId, level: sig.decision.level,
    predictedProbability: sig.decision.combinedProbability, components: [],
    transitionDate: sig.lastTransitionDate, entryDate: asOf, plannedExitDate: sessionAfter(benchDates, sig.lastTransitionDate, sig.window.exitOffset),
    issuedAt: nowIso, outcome: null, realizedCar: null, exitDate: null, outcomeRecordedAt: null,
  };
}

/** Kết quả cho bản ghi đã tới ngày thoát (chỉ dùng giá đã có — không ngoại suy). */
export function planSectorResolutions(open: SectorTrackRow[], indexOf: (code: string) => PricePoint[] | undefined, bench: PricePoint[]): { id: string; outcome: 0 | 1; realizedCar: number; exitDate: string }[] {
  const bm = new Map(bench.map((p) => [p.date, p.adjClose])), lastB = bench.at(-1)?.date;
  const out: { id: string; outcome: 0 | 1; realizedCar: number; exitDate: string }[] = [];
  for (const r of open) {
    if (r.outcome !== null || !lastB || lastB < r.plannedExitDate) continue;
    const ix = indexOf(r.sectorCode); if (!ix?.length) continue;
    const sm = new Map(ix.map((p) => [p.date, p.adjClose]));
    const exitDate = bench.find((p) => p.date >= r.plannedExitDate)?.date;
    if (!exitDate) continue;
    const s0 = sm.get(r.entryDate), s1 = sm.get(exitDate), b0 = bm.get(r.entryDate), b1 = bm.get(exitDate);
    if (!(s0 && s1 && b0 && b1)) continue;
    const car = Math.log(s1 / s0) - Math.log(b1 / b0);
    out.push({ id: r.id, outcome: car > 0 ? 1 : 0, realizedCar: car, exitDate });
  }
  return out;
}

export function summarizeSectorTracking(rows: SectorTrackRow[]): TrackingSummary {
  return summarizeTracking(rows.map((r): TrackRow => ({
    id: r.id, ticker: r.sectorCode, windowId: r.windowId, level: r.level, predictedProbability: r.predictedProbability, components: r.components,
    exDate: r.transitionDate, exDateStatus: "CONFIRMED", entryDate: r.entryDate, plannedExitDate: r.plannedExitDate, issuedAt: r.issuedAt,
    outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: r.outcomeRecordedAt,
  })));
}
