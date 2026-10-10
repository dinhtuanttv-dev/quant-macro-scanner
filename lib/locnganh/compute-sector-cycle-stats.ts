// Port từ locnganh-timing-engine (backend/sector-rotation/compute-sector-cycle-stats.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * lib/locnganh/ (port từ gói locnganh-timing-engine: backend/sector-rotation/compute-sector-cycle-stats.ts
 *
 * Lắp SectorCycleStatsV3 cho một ngành, tái dùng gần như toàn bộ hạ tầng của
 * compute-cycle-paths.ts (CAR quanh một mốc ngày — ở đây là ngày CHUYỂN VÀO Improving, thay vì
 * GDKHQ) và compute-cycle-stats.ts (computeWindowStat/computeFdrAcrossWindows — thuần theo
 * "danh sách mẫu sự kiện", không biết gì về RRG). Phần mới chỉ là:
 *
 * 1. `buildEventSamplesFromPaths`: đọc giá trị CAR tại offset entryFrom/exitOffset từ output
 *    của computeCyclePaths để tạo EventSample[] — compute-cycle-stats.ts cần EventSample đã
 *    tính sẵn carAtEntry/carAtExit, không tự tính từ chuỗi giá.
 * 2. `computeIndustryGroupPrior`: shrinkage LIÊN NGÀNH CÙNG NHÓM (ví dụ nhóm cyclical: Thép,
 *    Chứng khoán, Bất động sản — khác nhóm defensive: Điện, Nước, Tiêu dùng thiết yếu), cùng
 *    công thức empirical-Bayes đã dùng cho "liên mã cùng ngành/quý" ở earnings-seasonality.
 * 3. Gắn `reactionProbability` (Beta-Binomial, core/beta-binomial.ts) cho cửa sổ được chọn —
 *    xác suất ngành outperform benchmark từ entry đến exit, dạng phân phối, không phải winRate.
 *
 * `netDividendYield` của mọi EventSample ở đây LUÔN = 0 — không có khái niệm cổ tức tiền mặt
 * gắn với một lần chuyển quadrant.
 */
import {
  DEFAULT_COSTS,
  DEFAULT_GATING,
  computeFdrAcrossWindows,
  computeWindowStat,
  netReturnOfEvent,
  sampleVariance,
  type BootstrapConfig,
  type ComputedWindowStat,
  type CostConfig,
  type EventSample,
  type GatingConfig,
  type WindowCandidate,
} from "@/lib/cotuc/timing-v3/compute-cycle-stats";
import { computeCyclePaths } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import type { PricePoint } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import type { HolidayCalendar } from "@/lib/cotuc/timing-v3/date-utils";
import { betaBinomialPosterior, estimatePriorFromRates } from "@/lib/cotuc/timing-v3/seasonality/beta-binomial";
import type { BacktestWindow, Quadrant, QuadrantTransition, SectorCycleStatsV3 } from "./sector-types";

export interface SectorGroupPrior {
  priorMean: number;
  betweenVar: number;
  winRatePriorAlpha0: number;
  winRatePriorBeta0: number;
  nSectorsUsed: number;
}

/**
 * Prior từ CÁC NGÀNH KHÁC cùng nhóm (leave-one-out đảm bảo ở tầng gọi — hàm này không tự loại
 * trừ ngành đang xét). `samplesPerSector[i]` là EventSample[] của MỘT ngành khác, cùng nhóm,
 * CÙNG cửa sổ đang xét.
 */
export function computeIndustryGroupPrior(samplesPerSector: EventSample[][], costs: CostConfig = DEFAULT_COSTS): SectorGroupPrior {
  const means: number[] = [];
  const winRates: number[] = [];
  for (const samples of samplesPerSector) {
    if (samples.length === 0) continue;
    const nets = samples.map((s) => netReturnOfEvent(s, costs));
    means.push(nets.reduce((a, b) => a + b, 0) / nets.length);
    winRates.push(nets.filter((x) => x > 0).length / nets.length);
  }
  if (means.length === 0) {
    return { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nSectorsUsed: 0 };
  }
  const priorMean = means.reduce((a, b) => a + b, 0) / means.length;
  const betweenVarRaw = means.length >= 2 ? sampleVariance(means) : Math.max(priorMean ** 2, 1e-4);
  const { alpha0, beta0 } = estimatePriorFromRates(winRates);
  return {
    priorMean,
    betweenVar: Math.max(betweenVarRaw, 1e-6),
    winRatePriorAlpha0: alpha0,
    winRatePriorBeta0: beta0,
    nSectorsUsed: means.length,
  };
}

/**
 * Đọc CAR tại offset `entryFrom` (coi là giá vào) và `exitOffset` (giá ra) từ output của
 * computeCyclePaths, tạo EventSample cho MỘT cửa sổ ứng viên. Sự kiện thiếu dữ liệu tại 1 trong
 * 2 offset (null) bị BỎ QUA — không suy diễn, không nội suy.
 */
export function buildEventSamplesFromPaths(
  offsets: number[],
  eventPaths: { exDate: string; car: (number | null)[] }[],
  entryFrom: number,
  exitOffset: number,
): EventSample[] {
  const entryIdx = offsets.indexOf(entryFrom);
  const exitIdx = offsets.indexOf(exitOffset);
  if (entryIdx === -1 || exitIdx === -1) {
    throw new Error(`buildEventSamplesFromPaths: entryFrom=${entryFrom} hoặc exitOffset=${exitOffset} không nằm trong offsets đã tính`);
  }
  const out: EventSample[] = [];
  for (const ep of eventPaths) {
    const carAtEntry = ep.car[entryIdx];
    const carAtExit = ep.car[exitIdx];
    if (carAtEntry === null || carAtExit === null) continue;
    const year = Number(ep.exDate.slice(0, 4));
    out.push({ exDate: ep.exDate, carAtEntry, carAtExit, netDividendYield: 0, year });
  }
  return out;
}

export interface SectorWindowDef {
  id: string;
  label: string;
  entryFrom: number;
  entryTo: number;
  exitOffset: number;
}

export interface ComputeSectorCycleStatsInput {
  sectorKey: string;
  targetQuadrant: Quadrant;
  transitions: QuadrantTransition[];
  sectorPrices: PricePoint[];
  benchmarkPrices: PricePoint[];
  windowDefs: SectorWindowDef[];
  cal: HolidayCalendar;
  prior: SectorGroupPrior;
  version: string;
  asOf: string;
  costs?: CostConfig;
  gating?: GatingConfig;
  bootstrap?: BootstrapConfig;
  benchmark?: 'VNINDEX' | 'SECTOR';
}

export function computeSectorCycleStats(input: ComputeSectorCycleStatsInput): SectorCycleStatsV3 {
  const { sectorKey, targetQuadrant, transitions, sectorPrices, benchmarkPrices, windowDefs, cal, prior, version, asOf } = input;
  const costs = input.costs ?? DEFAULT_COSTS;
  const gating = input.gating ?? DEFAULT_GATING;

  const allOffsets = Array.from(new Set(windowDefs.flatMap((w) => [w.entryFrom, w.exitOffset]))).sort((a, b) => a - b);

  const pathsOutput = computeCyclePaths({
    ticker: sectorKey,
    stockPrices: sectorPrices,
    benchmarkPrices,
    events: transitions.map((t) => ({ exDate: t.date })),
    offsets: allOffsets,
    cal,
    version,
    asOf,
  });

  const candidates: WindowCandidate[] = windowDefs.map((w) => ({
    id: w.id,
    label: w.label,
    entryFrom: w.entryFrom,
    entryTo: w.entryTo,
    exitOffset: w.exitOffset,
    holdsThroughEx: false,
    samples: buildEventSamplesFromPaths(pathsOutput.offsets, pathsOutput.eventPaths, w.entryFrom, w.exitOffset),
  }));

  const computed: ComputedWindowStat[] = candidates.map((c) =>
    computeWindowStat(c, { costs, gating, bootstrap: input.bootstrap, priorMean: prior.priorMean, betweenVar: prior.betweenVar }),
  );
  const windows = computeFdrAcrossWindows(computed, gating);

  const eligible = windows.filter((w) => w.selected);
  const best = eligible.reduce<BacktestWindow | null>(
    (acc, w) => (acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc),
    null,
  );

  let reactionProbability: SectorCycleStatsV3['reactionProbability'] = null;
  if (best) {
    const bestCandidate = candidates.find((c) => c.id === best.id)!;
    const nets = bestCandidate.samples.map((s) => netReturnOfEvent(s, costs));
    const wins = nets.filter((x) => x > 0).length;
    const losses = nets.length - wins;
    reactionProbability = betaBinomialPosterior(wins, losses, prior.winRatePriorAlpha0, prior.winRatePriorBeta0, gating.confidenceLevel);
  }

  return {
    ticker: sectorKey,
    version,
    asOf,
    eventType: 'QUADRANT_TRANSITION',
    targetQuadrant,
    windows,
    selectedWindowId: best?.id ?? null,
    adjustedPriceBasis: 'ADJ_CLOSE',
    benchmark: input.benchmark ?? 'VNINDEX',
    reactionProbability,
  };
}
