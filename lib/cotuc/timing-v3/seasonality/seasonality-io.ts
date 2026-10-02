// Lớp I/O cho Mùa vụ KQKD theo quý (giai đoạn 3 gói cotuc-timing-engine) — chạy trong cron, chia 2 pha vì giới hạn
// thời gian thực của Vercel (xem app/api/cron/earnings-seasonality-scan):
//   COLLECT (theo lô mã): giá SSI tổng lợi suất (price-source.ts) + lịch sử NGÀY CÔNG BỐ BCTC thật (CafeF, ưu tiên hợp
//     nhất) -> CAR quanh ngày công bố (computeCyclePaths TÁI DÙNG, ngày công bố thay GDKHQ) -> mẫu từng cửa sổ × quý;
//     kèm EarningsSignal (cho "Sắp KQKD") -> lưu EarningsSeasonalityCache.
//   FINALIZE (cả danh mục): prior ngành × quý × CỬA SỔ từ các mã cùng ngành (thiếu mã cùng ngành -> cả danh mục) ->
//     computeFullYearEarningsCycleStats (FDR gộp 4 quý × 4 cửa sổ, Beta-Binomial) + computeAnnualEarningsCalendar.

import { computeCyclePaths, toCyclePathsV3 } from "../compute-cycle-paths";
import type { EventSample, WindowCandidate } from "../compute-cycle-stats";
import { makeTradingCalendarFromPrices } from "../date-utils";
import type { AnnualEarningsCalendarV3, CyclePathsV3, EarningsCycleStatsV3, Quarter } from "../timing-types";
import { fetchEarningsDisclosureHistory, type EarningsDisclosureRecord } from "@/lib/cotuc/cafef-earnings-disclosure-scraper";
import { fetchVndQuarterlyFinancials } from "@/lib/cotuc/vndirect-finfo-adapter";
import type { PriceBar } from "../total-return";
import { computeFullYearEarningsCycleStats, computeIndustryQuarterPrior, type IndustryQuarterPrior } from "./compute-earnings-cycle-stats";
import { computeAnnualEarningsCalendar } from "./compute-annual-earnings-calendar";
import { EARNINGS_CANDIDATE_WINDOWS, buildEarningsOffsets } from "./earnings-windows";

export const SEASONALITY_VERSION = "v3-seasonality-1";
export const QUARTERS: Quarter[] = [1, 2, 3, 4];
const MIN_PEERS_FOR_INDUSTRY_PRIOR = 3;

export type SamplesByQuarter = Record<string, Record<string, EventSample[]>>; // quarter -> windowId -> samples
export type AnnounceByQuarter = Record<string, string[]>; // quarter -> ISO dates (tăng dần)

/** Mỗi (năm, quý) lấy 1 ngày công bố: ưu tiên BCTC HỢP NHẤT (khớp số liệu VCI), không có thì công ty mẹ. */
export function pickAnnounceDates(records: EarningsDisclosureRecord[]): AnnounceByQuarter {
  const best = new Map<string, EarningsDisclosureRecord>();
  for (const r of records) {
    if (!(r.quarter >= 1 && r.quarter <= 4) || !/^\d{4}-\d{2}-\d{2}$/.test(r.announceDate)) continue;
    const key = `${r.year}-${r.quarter}`;
    const cur = best.get(key);
    if (!cur || (cur.isParentOnly && !r.isParentOnly)) best.set(key, r);
  }
  const out: AnnounceByQuarter = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of best.values()) out[String(r.quarter)].push(r.announceDate);
  for (const q of Object.keys(out)) out[q] = [...new Set(out[q])].sort();
  return out;
}

/** CAR quanh ngày công bố -> mẫu theo cửa sổ (hàm thuần). */
export function buildSeasonalitySamples(
  ticker: string, stock: PriceBar[], bench: PriceBar[], announce: AnnounceByQuarter, asOf: string,
): { samples: SamplesByQuarter; paths: Record<string, CyclePathsV3>; skipped: number } {
  const offsets = buildEarningsOffsets();
  const offsetIndex = new Map(offsets.map((o, i) => [o, i]));
  const stockDates = new Set(stock.map((p) => p.date));
  const cal = makeTradingCalendarFromPrices(bench.map((p) => p.date).filter((d) => stockDates.has(d)));
  const samples: SamplesByQuarter = {};
  const paths: Record<string, CyclePathsV3> = {};
  let skipped = 0;
  // Ngày 0 = PHIÊN GIAO DỊCH ĐẦU TIÊN kể từ ngày công bố (BCTC hay công bố cuối tuần / sau giờ đóng cửa: thị trường chỉ
  // phản ứng ở phiên kế tiếp). Lấy theo chính chuỗi giá (không cần danh sách nghỉ lễ).
  const sessions = bench.map((p) => p.date).filter((d) => stockDates.has(d)).sort();
  const toSession = (d: string): string | null => {
    let lo = 0, hi = sessions.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sessions[mid] < d) lo = mid + 1; else hi = mid; }
    return sessions[lo] ?? null;
  };
  for (const q of QUARTERS) {
    const dates = [...new Set((announce[String(q)] ?? []).map(toSession).filter((d): d is string => d !== null))];
    samples[String(q)] = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, [] as EventSample[]]));
    if (!dates.length) continue;
    const out = computeCyclePaths({
      ticker, stockPrices: stock, benchmarkPrices: bench, events: dates.map((exDate) => ({ exDate })),
      offsets, cal, currentExDate: null, version: SEASONALITY_VERSION, asOf,
    });
    skipped += out.skippedEvents.length;
    paths[String(q)] = toCyclePathsV3(out) as unknown as CyclePathsV3;
    for (const w of EARNINGS_CANDIDATE_WINDOWS) {
      const ei = offsetIndex.get(w.entryTo)!, xi = offsetIndex.get(w.exitOffset)!;
      for (const ep of out.eventPaths) {
        const a = ep.car[ei], b = ep.car[xi];
        if (a === null || b === null) continue;
        samples[String(q)][w.id].push({ exDate: ep.exDate, carAtEntry: a, carAtExit: b, netDividendYield: 0, year: Number(ep.exDate.slice(0, 4)) });
      }
    }
  }
  return { samples, paths, skipped };
}

/** Ngày công bố BCTC quý: VNDirect finfo (ngày nhập BCTC) là nguồn chính; CafeF là dự phòng. */
export async function fetchAnnounceDates(ticker: string): Promise<{ ok: boolean; announce: AnnounceByQuarter; source?: string; error?: string }> {
  const vnd = await fetchVndQuarterlyFinancials(ticker);
  const fromVnd = vnd.quarters.filter((q) => q.announceDate).map((q) => ({ year: q.year, quarter: q.quarter, isParentOnly: false, announceDate: q.announceDate! }));
  if (vnd.available && fromVnd.length) return { ok: true, announce: pickAnnounceDates(fromVnd), source: "VNDIRECT" };
  const r = await fetchEarningsDisclosureHistory(ticker);
  if (!r.success) return { ok: false, announce: { 1: [], 2: [], 3: [], 4: [] }, error: `VNDirect: ${vnd.error ?? "không có ngày"}; CafeF: ${r.error ?? "lỗi"}` };
  return { ok: true, announce: pickAnnounceDates(r.records), source: "CAFEF" };
}

export interface CollectedTicker { ticker: string; sector: string | null; samples: SamplesByQuarter; announce: AnnounceByQuarter }

/** Prior ngành × quý × cửa sổ: các mã KHÁC cùng ngành; < 3 mã thì dùng các mã khác trong cả danh mục (hàm thuần). */
export function buildPriors(target: CollectedTicker, all: CollectedTicker[]): Record<Quarter, { prior: IndustryQuarterPrior; priorByWindow: Record<string, IndustryQuarterPrior>; scope: "INDUSTRY" | "UNIVERSE" | "NONE" }> {
  const others = all.filter((c) => c.ticker !== target.ticker);
  const sameSector = target.sector ? others.filter((c) => c.sector === target.sector) : [];
  const out = {} as Record<Quarter, { prior: IndustryQuarterPrior; priorByWindow: Record<string, IndustryQuarterPrior>; scope: "INDUSTRY" | "UNIVERSE" | "NONE" }>;
  for (const q of QUARTERS) {
    const withData = (list: CollectedTicker[]) => list.filter((c) => EARNINGS_CANDIDATE_WINDOWS.some((w) => (c.samples[String(q)]?.[w.id] ?? []).length > 0));
    const industry = withData(sameSector);
    const peers = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? industry : withData(others);
    const scope = industry.length >= MIN_PEERS_FOR_INDUSTRY_PRIOR ? "INDUSTRY" : peers.length ? "UNIVERSE" : "NONE";
    const priorByWindow = Object.fromEntries(EARNINGS_CANDIDATE_WINDOWS.map((w) => [w.id, computeIndustryQuarterPrior(peers.map((c) => c.samples[String(q)]?.[w.id] ?? []))]));
    out[q] = { prior: priorByWindow[EARNINGS_CANDIDATE_WINDOWS[0].id], priorByWindow, scope };
  }
  return out;
}

/** Thống kê cả năm + lịch công bố cho 1 mã (hàm thuần). */
export function finalizeTicker(target: CollectedTicker, all: CollectedTicker[], asOf: string): {
  stats: Record<Quarter, EarningsCycleStatsV3>; calendar: AnnualEarningsCalendarV3; priorScope: Record<string, string>;
} {
  const priors = buildPriors(target, all);
  const byQuarter = {} as Record<Quarter, { candidates: WindowCandidate[]; prior: IndustryQuarterPrior; priorByWindow: Record<string, IndustryQuarterPrior> }>;
  for (const q of QUARTERS) {
    byQuarter[q] = {
      candidates: EARNINGS_CANDIDATE_WINDOWS.map((w) => ({ ...w, samples: target.samples[String(q)]?.[w.id] ?? [] })),
      prior: priors[q].prior, priorByWindow: priors[q].priorByWindow,
    };
  }
  const stats = computeFullYearEarningsCycleStats(target.ticker, byQuarter, { version: SEASONALITY_VERSION, asOf, benchmark: "VNINDEX" });
  const historical = Object.fromEntries(QUARTERS.map((q) => [q, target.announce[String(q)] ?? []])) as Record<Quarter, string[]>;
  const calendar = computeAnnualEarningsCalendar({
    ticker: target.ticker, version: SEASONALITY_VERSION, asOf, historicalAnnounceDatesByQuarter: historical, earningsCycleStatsByQuarter: stats,
  });
  return { stats, calendar, priorScope: Object.fromEntries(QUARTERS.map((q) => [q, priors[q].scope])) };
}
