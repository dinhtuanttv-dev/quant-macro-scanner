// lib/cycle-fingerprint/cycle-scanner.ts
//
// GIAI DOAN 1 (Top-K Similarity) - pham vi that su trien khai:
// Quet CHINH LICH SU CUA MA DANG XEM (khong phai toan thi truong VN) de
// tim cac giai doan qua khu co MAU HINH GIA giong voi cua so hien tai nhat.
// Quet cheo nhieu ma (cross-market) va phan cum HDBSCAN la pham vi Giai
// doan sau, CHUA lam o day - da thong nhat ro voi nguoi dung truoc khi
// viet code nay.
//
// QUY UOC sessionOffset (FIX 2026-09-11 - quan trong, anh huong toan bo
// cach ve bieu do): 0 = DIEM KET THUC cua so (= hom nay doi voi gia hien
// tai, = ngay ket thuc mau hinh doi voi 1 match lich su). Am = truoc do,
// duong = sau do. Quy uoc nay dam bao khi chong (overlay) nhieu chuoi len
// CUNG 1 truc X trong MainChart, moi chuoi deu "khop" dung tai vi tri
// tuong duong trong chu ky cua no - truoc day dung 0..windowSize-1 (0 =
// DAU cua so) khien cac chuoi bi lech truc khi ve chung.
import type { OhlcvBar } from "@/lib/market-data/tcbs-adapter";
import { dtwDistance, normalizeToBase100 } from "./dtw";
import { calculateAtrSeries, detectMarketRegime } from "@/lib/market-data/technical-indicators";

const FORWARD_HORIZONS = [10, 20, 30, 60] as const;
const MAX_FORWARD_HORIZON = 60;
// So ung vien dung de tinh Fan Chart/Timing Forecast (thong ke rong hon),
// TACH RIENG voi so match hien thi trong TopKList (K=5, de doc). Nhieu mau
// hon giup dai xac suat/du bao thoi gian dang tin cay hon ve mat thong ke.
const STATS_POOL_SIZE = 20;

export interface SeriesPoint { sessionOffset: number; normalizedClose: number; }

export interface CycleMatchResult {
  startIndex: number;
  endIndex: number; // inclusive
  matchStartDate: string;
  matchEndDate: string;
  distance: number;
  similarityPct: number; // 0-100, da chuan hoa trong pham vi lan quet nay
  alignedSeries: SeriesPoint[]; // MAU HINH (offset am..0, base=100 tai DAU cua so)
  forwardSeries: SeriesPoint[]; // DIEN BIEN SAU DO (offset 0..+60, base=100 TAI DIEM KET THUC mau hinh)
  returns: Record<(typeof FORWARD_HORIZONS)[number], number>;
  forwardMaxDrawdownPct: number;
}

/**
 * Tim toi da `poolSize` giai doan lich su co mau hinh gia GIONG NHAT voi
 * cua so hien tai, dung DTW tren chuoi da chuan hoa base=100. Tra ve toan
 * bo pool (khong chi K hien thi) - noi goi tu quyet dinh lay bao nhieu de
 * hien thi (TopKList) vs bao nhieu de tinh thong ke (Fan Chart).
 */
export function findTopKCycles(bars: OhlcvBar[], windowSize: number, poolSize: number = STATS_POOL_SIZE): CycleMatchResult[] {
  const closes = bars.map((b) => b.close);
  const L = closes.length;
  if (L < windowSize * 2 + MAX_FORWARD_HORIZON) return [];

  const currentWindowStartIdx = L - windowSize;
  const currentWindowRaw = closes.slice(currentWindowStartIdx, L);
  const currentWindowNorm = normalizeToBase100(currentWindowRaw);

  const maxCandidateEndExclusive = Math.min(currentWindowStartIdx, L - MAX_FORWARD_HORIZON);

  const scored: { startIndex: number; endIndex: number; distance: number }[] = [];
  for (let start = 0; start + windowSize <= maxCandidateEndExclusive; start++) {
    const end = start + windowSize;
    const slice = closes.slice(start, end);
    const norm = normalizeToBase100(slice);
    const distance = dtwDistance(currentWindowNorm, norm);
    scored.push({ startIndex: start, endIndex: end - 1, distance });
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => a.distance - b.distance);
  const top = scored.slice(0, poolSize);

  const allDistances = scored.map((s) => s.distance);
  const dMin = Math.min(...allDistances);
  const dMax = Math.max(...allDistances);
  const distanceRange = Math.max(dMax - dMin, 1e-9);

  return top.map((cand) => {
    const matchEndIdxExclusive = cand.endIndex + 1;

    // Mau hinh (pattern) - base=100 tai DAU cua so, offset AM den 0 (0 = ket thuc mau hinh)
    const alignedSlice = closes.slice(cand.startIndex, matchEndIdxExclusive);
    const alignedNorm = normalizeToBase100(alignedSlice);
    const alignedSeries: SeriesPoint[] = alignedNorm.map((v, i) => ({
      sessionOffset: i - (windowSize - 1),
      normalizedClose: v,
    }));

    // Dien bien SAU DO (forward) - base=100 TAI DIEM KET THUC mau hinh, offset 0..+60
    const priceAtMatchEnd = closes[cand.endIndex];
    const forwardRaw = closes.slice(cand.endIndex, Math.min(cand.endIndex + MAX_FORWARD_HORIZON + 1, L));
    const forwardSeries: SeriesPoint[] = forwardRaw.map((c, i) => ({
      sessionOffset: i,
      normalizedClose: priceAtMatchEnd === 0 ? 100 : (c / priceAtMatchEnd) * 100,
    }));

    const returns = {} as Record<(typeof FORWARD_HORIZONS)[number], number>;
    for (const h of FORWARD_HORIZONS) {
      const futureIdx = cand.endIndex + h;
      const futurePrice = futureIdx < L ? closes[futureIdx] : closes[L - 1];
      returns[h] = priceAtMatchEnd === 0 ? 0 : Math.round(((futurePrice - priceAtMatchEnd) / priceAtMatchEnd) * 1000) / 10;
    }

    const forwardSlice = closes.slice(cand.endIndex, Math.min(cand.endIndex + MAX_FORWARD_HORIZON + 1, L));
    let peak = forwardSlice[0] ?? priceAtMatchEnd;
    let maxDD = 0;
    for (const c of forwardSlice) {
      if (c > peak) peak = c;
      const dd = peak === 0 ? 0 : ((c - peak) / peak) * 100;
      if (dd < maxDD) maxDD = dd;
    }

    const similarityPct = Math.round((1 - (cand.distance - dMin) / distanceRange) * 1000) / 10;

    return {
      startIndex: cand.startIndex,
      endIndex: cand.endIndex,
      matchStartDate: bars[cand.startIndex]?.date ?? "",
      matchEndDate: bars[cand.endIndex]?.date ?? "",
      distance: cand.distance,
      similarityPct,
      alignedSeries,
      forwardSeries,
      returns,
      forwardMaxDrawdownPct: Math.round(maxDD * 10) / 10,
    };
  });
}

export interface QualityScoreResult {
  similarity: number; liquidity: number; regime: number; sampleSize: number; overall: number;
}

export function computeQualityScore(matches: CycleMatchResult[], bars: OhlcvBar[], regimeConfidence: number): QualityScoreResult {
  const similarity = matches.length > 0
    ? matches.reduce((s, m) => s + m.similarityPct, 0) / matches.length / 100
    : 0;

  let liquidity = 0.5;
  if (bars.length >= 20) {
    const recentAvgVol = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    const fullAvgVol = bars.reduce((s, b) => s + b.volume, 0) / bars.length;
    if (fullAvgVol > 0) liquidity = Math.max(0, Math.min(1, (recentAvgVol / fullAvgVol) / 1.5));
  }

  const regime = Math.max(0, Math.min(1, regimeConfidence / 100));
  const sampleSize = Math.min(1, matches.length / 5);
  const overall = similarity * 0.4 + liquidity * 0.2 + regime * 0.2 + sampleSize * 0.2;

  return {
    similarity: Math.round(similarity * 1000) / 1000,
    liquidity: Math.round(liquidity * 1000) / 1000,
    regime: Math.round(regime * 1000) / 1000,
    sampleSize: Math.round(sampleSize * 1000) / 1000,
    overall: Math.round(overall * 1000) / 1000,
  };
}

export interface SummaryStatsResult {
  winRatePct: number; avgReturnPct: number; maxDrawdownPct: number; sampleCount: number;
}

export function computeSummaryStats(matches: CycleMatchResult[]): SummaryStatsResult {
  if (matches.length === 0) return { winRatePct: 0, avgReturnPct: 0, maxDrawdownPct: 0, sampleCount: 0 };
  const d30Returns = matches.map((m) => m.returns[30]);
  const winCount = d30Returns.filter((r) => r > 0).length;
  const avgReturn = d30Returns.reduce((s, r) => s + r, 0) / d30Returns.length;
  const worstDrawdown = Math.min(...matches.map((m) => m.forwardMaxDrawdownPct));
  return {
    winRatePct: Math.round((winCount / d30Returns.length) * 1000) / 10,
    avgReturnPct: Math.round(avgReturn * 10) / 10,
    maxDrawdownPct: worstDrawdown,
    sampleCount: matches.length,
  };
}

// ============================================================
// FAN CHART (P10-P90) - moi
// Dai xac suat tai TUNG phien sau khi mau hinh ket thuc, tinh tu phan vi
// (percentile, noi suy tuyen tinh) cua forwardSeries qua toan bo pool
// (STATS_POOL_SIZE match, khong chi 5 hien thi) - nhieu mau hon giup dai
// dang tin cay hon ve mat thong ke so voi chi dung 5 diem.
// ============================================================

export interface FanChartBandResult { sessionOffset: number; p10: number; p25: number; p50: number; p75: number; p90: number; }

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedAsc[lower];
  const frac = idx - lower;
  return sortedAsc[lower] + (sortedAsc[upper] - sortedAsc[lower]) * frac;
}

export function computeFanChart(matches: CycleMatchResult[]): FanChartBandResult[] {
  if (matches.length === 0) return [];
  const maxOffset = Math.max(...matches.map((m) => m.forwardSeries.length - 1));
  const bands: FanChartBandResult[] = [];

  for (let offset = 0; offset <= maxOffset; offset++) {
    const values = matches
      .map((m) => m.forwardSeries.find((p) => p.sessionOffset === offset)?.normalizedClose)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    if (values.length === 0) continue;

    bands.push({
      sessionOffset: offset,
      p10: Math.round(percentile(values, 0.1) * 100) / 100,
      p25: Math.round(percentile(values, 0.25) * 100) / 100,
      p50: Math.round(percentile(values, 0.5) * 100) / 100,
      p75: Math.round(percentile(values, 0.75) * 100) / 100,
      p90: Math.round(percentile(values, 0.9) * 100) / 100,
    });
  }
  return bands;
}

// ============================================================
// TIMING FORECAST - moi
// Xac suat "cham" muc tieu loi nhuan trong vong N phien (hitting-time don
// gian hoa: kiem tra forwardSeries co dat gia tri muc tieu TAI BAT KY DIEM
// NAO trong khoang [1, N] hay khong, khong chi tai dung diem N) + so phien
// trung binh de dat dinh/day trong 60 phien sau do.
// ============================================================

export interface TimingForecastResult {
  targetReturnPct: number;
  hittingProbability: { withinSessions: number; probabilityPct: number }[];
  daysToPeak: number;
  daysToTrough: number;
}

function reachedTargetWithin(forwardSeries: SeriesPoint[], targetPct: number, withinSessions: number): boolean {
  const targetValue = 100 * (1 + targetPct / 100);
  const relevant = forwardSeries.filter((p) => p.sessionOffset > 0 && p.sessionOffset <= withinSessions);
  return targetPct >= 0 ? relevant.some((p) => p.normalizedClose >= targetValue) : relevant.some((p) => p.normalizedClose <= targetValue);
}

export function computeTimingForecast(matches: CycleMatchResult[], avgReturnPct: number): TimingForecastResult {
  // Muc tieu = trung binh return d30 cua chinh cac match tim duoc, lam tron
  // ve boi so 1% gan nhat, toi thieu +-3% de tranh muc tieu qua nho vo nghia.
  const rounded = Math.round(avgReturnPct);
  const targetReturnPct = rounded === 0 ? 3 : (Math.abs(rounded) < 3 ? Math.sign(rounded) * 3 : rounded);

  const horizons = [10, 20, 30, 60];
  const hittingProbability = horizons.map((h) => {
    const count = matches.filter((m) => reachedTargetWithin(m.forwardSeries, targetReturnPct, h)).length;
    return { withinSessions: h, probabilityPct: matches.length > 0 ? Math.round((count / matches.length) * 1000) / 10 : 0 };
  });

  const peakOffsets = matches.map((m) => {
    let peakVal = -Infinity, peakOffset = 0;
    for (const p of m.forwardSeries) if (p.normalizedClose > peakVal) { peakVal = p.normalizedClose; peakOffset = p.sessionOffset; }
    return peakOffset;
  });
  const troughOffsets = matches.map((m) => {
    let troughVal = Infinity, troughOffset = 0;
    for (const p of m.forwardSeries) if (p.normalizedClose < troughVal) { troughVal = p.normalizedClose; troughOffset = p.sessionOffset; }
    return troughOffset;
  });

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    targetReturnPct,
    hittingProbability,
    daysToPeak: Math.round(avg(peakOffsets) * 10) / 10,
    daysToTrough: Math.round(avg(troughOffsets) * 10) / 10,
  };
}

// ============================================================
// EXPLAINABILITY - moi
// Ty trong DONG GOP THAT cua tung thanh phan vao Quality Score tong (khong
// phai trong so khai bao - VD 1 thanh phan co trong so 40% nhung ban than
// diem thanh phan do thap thi dong gop THUC TE vao tong diem cung thap).
// ============================================================

export interface ExplainFactorResult { name: string; contributionPct: number; description: string; }

export function computeExplainability(qs: QualityScoreResult, matchCount: number): ExplainFactorResult[] {
  const weights = { similarity: 0.4, liquidity: 0.2, regime: 0.2, sampleSize: 0.2 };
  const weighted = {
    similarity: qs.similarity * weights.similarity,
    liquidity: qs.liquidity * weights.liquidity,
    regime: qs.regime * weights.regime,
    sampleSize: qs.sampleSize * weights.sampleSize,
  };
  const total = Object.values(weighted).reduce((a, b) => a + b, 0) || 1e-9;

  return [
    {
      name: "Similarity", contributionPct: Math.round((weighted.similarity / total) * 1000) / 10,
      description: `Cac chu ky lich su tim duoc co do tuong dong trung binh ${Math.round(qs.similarity * 100)}% (DTW) voi mau hinh hien tai.`,
    },
    {
      name: "Liquidity", contributionPct: Math.round((weighted.liquidity / total) * 1000) / 10,
      description: `Khoi luong giao dich gan day dat ${Math.round(qs.liquidity * 100)}% muc tham chieu (uoc tinh don gian tren chinh lich su cua ma, chua phai xep hang thanh khoan toan thi truong).`,
    },
    {
      name: "Regime", contributionPct: Math.round((weighted.regime / total) * 1000) / 10,
      description: `Do tin cay nhan dien trang thai thi truong hien tai (xu huong tang/giam/di ngang) dat ${Math.round(qs.regime * 100)}%.`,
    },
    {
      name: "Sample-size", contributionPct: Math.round((weighted.sampleSize / total) * 1000) / 10,
      description: `Tim duoc ${matchCount} chu ky lich su du dieu kien (toi da 5 de dat diem tuyet doi).`,
    },
  ];
}

export { detectMarketRegime, calculateAtrSeries };
