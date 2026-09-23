// Elite 10 - Muc H (Tech Spec v2, ban rut gon phu hop dung bai toan):
// Time-Series K-Fold Stability - THAY THE PBO/CSCV chuan (thiet ke cho
// bai toan "chon tham so toi uu giua nhieu chien luoc", KHONG phu hop
// voi cac pattern quy tac CO DINH nhu FVG/BOS/CHoCH/OrderBlock o day).
// MODULE HOAN TOAN MOI, KHONG SUA triple-barrier.ts/pattern-backtest.ts
// dang hoat dong dung - CHI TAI DUNG applyTripleBarrier() da co.
//
// Y TUONG: chia du lieu thanh K giai doan LIEN TIEP THEO THOI GIAN
// (khong xao tron - du lieu tai chinh co tu tuong quan), tinh rieng ty
// le thang MOI GIAI DOAN. Stability Score = % giai doan co ty le thang
// >=50%, tren TONG SO giai doan CO DU MAU - day la XAC SUAT QUAN SAT
// TRUC TIEP tu du lieu (khong suy dien/uoc luong giai tiep).
import { applyTripleBarrier, type TripleBarrierBar } from "./triple-barrier";

export interface PeriodStability {
  periodIndex: number; startDate: string; endDate: string;
  sampleSize: number; winRatePct: number | null; // null neu khong du mau (< minSamplePerPeriod)
}

export interface StabilityResult {
  numPeriods: number;
  periods: PeriodStability[];
  periodsWithData: number;
  periodsWinning: number; // so giai doan co winRate >= 50%
  stabilityScorePct: number | null; // periodsWinning/periodsWithData*100, null neu <2 giai doan co du lieu
  winRateStdDevPct: number | null; // do lech chuan winRate qua cac giai doan co du lieu
  overallWinRatePct: number; // tinh chung tu TAT CA occurrences (khong phan chia theo giai doan)
  overallSampleSize: number;
  flagUnstable: boolean; // true neu overallWinRate cao (>=60%) NHUNG stabilityScore thap (<50%) - "co do" quan trong nhat
}

/** Chia bars thanh numPeriods giai doan LIEN TIEP theo thoi gian (theo
 * INDEX, khong phai theo ngay lich - moi giai doan co so phien gan
 * bang nhau). Tra ve mang [startIdx, endIdx) cho tung giai doan. */
function splitIntoPeriods(totalBars: number, numPeriods: number): [number, number][] {
  const periodSize = Math.floor(totalBars / numPeriods);
  const ranges: [number, number][] = [];
  for (let i = 0; i < numPeriods; i++) {
    const start = i * periodSize;
    const end = i === numPeriods - 1 ? totalBars : (i + 1) * periodSize; // giai doan cuoi lay het phan du
    ranges.push([start, end]);
  }
  return ranges;
}

export function computeTimeSeriesStability(
  bars: TripleBarrierBar[], signalIndices: number[], atrSeries: number[],
  numPeriods = 6, atrMultiplier = 1.5, timeLimitDays = 20, minSamplePerPeriod = 2
): StabilityResult | null {
  if (signalIndices.length === 0) return null;

  const periodRanges = splitIntoPeriods(bars.length, numPeriods);

  // Tinh label cho TUNG occurrence 1 lan duy nhat (tai dung applyTripleBarrier),
  // roi nhom theo giai doan dua vao signalIndex nam trong range nao.
  const allResults = signalIndices
    .map((idx) => ({ idx, result: applyTripleBarrier(bars, idx, atrSeries, atrMultiplier, timeLimitDays) }))
    .filter((r): r is { idx: number; result: NonNullable<ReturnType<typeof applyTripleBarrier>> } => r.result !== null);

  if (allResults.length === 0) return null;

  const periods: PeriodStability[] = periodRanges.map(([start, end], i) => {
    const inPeriod = allResults.filter((r) => r.idx >= start && r.idx < end);
    const n = inPeriod.length;
    const winRatePct = n >= minSamplePerPeriod ? Math.round((inPeriod.filter((r) => r.result.label === 1).length / n) * 1000) / 10 : null;
    return { periodIndex: i, startDate: bars[start].date, endDate: bars[Math.min(end, bars.length) - 1].date, sampleSize: n, winRatePct };
  });

  const periodsWithData = periods.filter((p) => p.winRatePct !== null);
  const periodsWinning = periodsWithData.filter((p) => (p.winRatePct as number) >= 50).length;
  const stabilityScorePct = periodsWithData.length >= 2 ? Math.round((periodsWinning / periodsWithData.length) * 1000) / 10 : null;

  let winRateStdDevPct: number | null = null;
  if (periodsWithData.length >= 2) {
    const rates = periodsWithData.map((p) => p.winRatePct as number);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
    winRateStdDevPct = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  const overallWins = allResults.filter((r) => r.result.label === 1).length;
  const overallWinRatePct = Math.round((overallWins / allResults.length) * 1000) / 10;

  const flagUnstable = overallWinRatePct >= 60 && stabilityScorePct !== null && stabilityScorePct < 50;

  return {
    numPeriods, periods, periodsWithData: periodsWithData.length, periodsWinning,
    stabilityScorePct, winRateStdDevPct,
    overallWinRatePct, overallSampleSize: allResults.length,
    flagUnstable,
  };
}
