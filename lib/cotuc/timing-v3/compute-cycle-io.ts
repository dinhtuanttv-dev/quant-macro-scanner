/**
 * compute-cycle-io.ts - Lop I/O THAT cho Timing Engine v3 (Giai doan 2):
 * noi computeCyclePaths()/computeCycleStats() (logic thuan, khong I/O,
 * copy tu goi cotuc-timing-engine.zip) voi du lieu gia that (Yahoo
 * Finance adapter da co) + lich su GDKHQ that (bang DividendCycleWindow
 * da co, tranh goi lai VCI khong can thiet).
 *
 * QUAN TRONG: route CU (/api/cotuc/cycle-stats) doc % loi nhuan THO
 * (khong tru benchmark) tu DB - v3 can CAR market-adjusted (r_stock -
 * r_benchmark), nen KHONG THE chi doc lai gia tri da luu san, PHAI
 * tinh lai tu dau qua computeCyclePaths(). Van tai su dung DANH SACH
 * exDate lich su da co trong DB (khong goi lai VCI).
 */
import { prisma } from "@/lib/prisma";
import { fetchOhlcvHistory, type OhlcvBar } from "@/lib/market-data/yahoo-finance-adapter";
import { computeCyclePaths, toCyclePathsV3 } from "./compute-cycle-paths";
import { computeCycleStats, type WindowCandidate, type EventSample } from "./compute-cycle-stats";
import { makeTradingCalendarFromPrices } from "./date-utils";
import { CANDIDATE_WINDOWS, buildRequiredOffsets } from "./candidate-windows";
import type { CyclePathsV3, CycleStatsV3 } from "./timing-types";

const VNINDEX_TICKER = "^VNINDEX.VN";

export interface CycleComputeContext {
  ticker: string;
  currentExDate?: string | null;
  cyclePaths: ReturnType<typeof computeCyclePaths>;
  eventExDates: string[];
}

export interface CycleContextFailure {
  reason: "STOCK_PRICE_FETCH_FAILED" | "BENCHMARK_PRICE_FETCH_FAILED" | "NO_DIVIDEND_HISTORY";
  detail: string;
}

/** Buoc chung: lay gia that (ma + VN-Index) + lich su GDKHQ that, roi
 * tinh CAR path (computeCyclePaths) - dung LAI cho ca 2 route
 * (cycle-paths va cycle-stats-v3), tranh goi Yahoo 2 lan.
 *
 * FIX (2026-09-26, phat hien qua kiem tra thuc te FPT): truoc day tra
 * ve "null" chung chung khi thieu du lieu, KHONG the biet buoc nao
 * that bai (gia hay lich su GDKHQ) - gio tra ve CycleContextFailure
 * co ly do cu the, de route log/hien thi chinh xac. */
export async function buildCycleContext(ticker: string): Promise<CycleComputeContext | CycleContextFailure> {
  const [stockRes, benchRes, historyRows] = await Promise.all([
    fetchOhlcvHistory(ticker, "2y"),
    fetchOhlcvHistory(VNINDEX_TICKER, "2y"),
    prisma.dividendCycleWindow.findMany({ where: { ticker }, orderBy: { exDate: "desc" } }),
  ]);

  if (!stockRes.success || !stockRes.data || stockRes.data.length < 60) {
    return {
      reason: "STOCK_PRICE_FETCH_FAILED",
      detail: `success=${stockRes.success}, so_phien=${stockRes.data?.length ?? 0} (can >=60). Loi: ${stockRes.error ?? "khong ro"}`,
    };
  }
  if (!benchRes.success || !benchRes.data || benchRes.data.length < 60) {
    return {
      reason: "BENCHMARK_PRICE_FETCH_FAILED",
      detail: `success=${benchRes.success}, so_phien=${benchRes.data?.length ?? 0} (can >=60). Loi: ${benchRes.error ?? "khong ro"}`,
    };
  }
  if (historyRows.length === 0) {
    return { reason: "NO_DIVIDEND_HISTORY", detail: `Khong tim thay dong nao trong bang DividendCycleWindow cho ticker="${ticker}"` };
  }

  const stockPrices = (stockRes.data as OhlcvBar[]).map((b: OhlcvBar) => ({ date: b.date, adjClose: b.adjClose }));
  const benchmarkPrices = (benchRes.data as OhlcvBar[]).map((b: OhlcvBar) => ({ date: b.date, adjClose: b.adjClose }));

  // Lich giao dich SUY TU CHINH gia THAT da tai (khong can danh sach
  // nghi le thu cong - xem giai thich chi tiet trong date-utils.ts).
  // Dung GIAO của 2 tap ngay (ma + benchmark deu phai co gia).
  const stockDateSet = new Set(stockPrices.map((p: { date: string }) => p.date));
  const commonDates = benchmarkPrices.map((p: { date: string }) => p.date).filter((d: string) => stockDateSet.has(d));
  const cal = makeTradingCalendarFromPrices(commonDates);

  const eventExDates = historyRows.map((r: { exDate: Date }) => r.exDate.toISOString().slice(0, 10));
  const offsets = buildRequiredOffsets();

  const cyclePaths = computeCyclePaths({
    ticker, stockPrices, benchmarkPrices,
    events: eventExDates.map((exDate: string) => ({ exDate })),
    offsets, cal,
    currentExDate: null, // GD hien tai (chua xay ra) - chua ho tro trong Giai doan 2, se bo sung neu can
    version: "v3-p2", asOf: new Date().toISOString().slice(0, 10),
  });

  return { ticker, cyclePaths, eventExDates };
}

export function buildCyclePathsV3(ctx: CycleComputeContext): CyclePathsV3 {
  return toCyclePathsV3(ctx.cyclePaths) as CyclePathsV3;
}

/** Tu CAR path da tinh, trich carAtEntry/carAtExit cho MOI cua so ung
 * vien (5 cua so chuan), tao EventSample[] roi goi computeCycleStats(). */
export function buildCycleStatsV3(ctx: CycleComputeContext): CycleStatsV3 {
  const offsets = buildRequiredOffsets();
  const offsetIndex = new Map(offsets.map((o, i) => [o, i]));

  const candidates: WindowCandidate[] = CANDIDATE_WINDOWS.map((w) => {
    const entryIdx = offsetIndex.get(w.entryTo)!;
    const exitIdx = offsetIndex.get(w.exitOffset)!;

    const samples: EventSample[] = [];
    for (const ep of ctx.cyclePaths.eventPaths) {
      const carAtEntry = ep.car[entryIdx];
      const carAtExit = ep.car[exitIdx];
      if (carAtEntry === null || carAtExit === null) continue; // thieu du lieu tai dot nay, bo qua
      samples.push({
        exDate: ep.exDate, carAtEntry, carAtExit,
        // DON GIAN HOA CO CHU DICH (Giai doan 2): chua co gia tri co
        // tuc chinh xac map theo tung dot rieng le trong pham vi nay -
        // dat 0 (KHONG bia so), se bo sung tu VCI events o giai doan sau
        // neu can chinh xac hon phan netExpectancy khi holdsThroughEx.
        netDividendYield: 0,
        year: Number(ep.exDate.slice(0, 4)),
      });
    }

    return {
      id: w.id, label: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo,
      exitOffset: w.exitOffset, holdsThroughEx: w.holdsThroughEx, samples,
    };
  });

  return computeCycleStats(ctx.ticker, candidates, {
    version: "v3-p2", asOf: new Date().toISOString().slice(0, 10), benchmark: "VNINDEX",
  });
}
