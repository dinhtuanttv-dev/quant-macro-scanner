// lib/cycle-fingerprint/cycle-scanner.ts
//
// GIAI DOAN 1 (Top-K Similarity) - pham vi that su trien khai:
// Quet CHINH LICH SU CUA MA DANG XEM (khong phai toan thi truong VN) de
// tim cac giai doan qua khu co MAU HINH GIA giong voi cua so hien tai nhat.
// Quet cheo nhieu ma (cross-market) va phan cum HDBSCAN la pham vi Giai
// doan sau, CHUA lam o day - da thong nhat ro voi nguoi dung truoc khi
// viet code nay.
import type { OhlcvBar } from "@/lib/market-data/tcbs-adapter";
import { dtwDistance, normalizeToBase100 } from "./dtw";
import { calculateAtrSeries, detectMarketRegime } from "@/lib/market-data/technical-indicators";

const FORWARD_HORIZONS = [10, 20, 30, 60] as const;
const MAX_FORWARD_HORIZON = 60;

export interface SeriesPoint { sessionOffset: number; normalizedClose: number; }

export interface CycleMatchResult {
  startIndex: number;
  endIndex: number; // inclusive
  matchStartDate: string;
  matchEndDate: string;
  distance: number;
  similarityPct: number; // 0-100, da chuan hoa trong pham vi lan quet nay
  // KHONG DUOC DOI offset cua truong nay (0..windowSize-1, 0 = DAU cua so) -
  // day chinh la nguyen nhan gay loi bieu do o lan trien khai Nhom 1 truoc
  // (doi sang -(windowSize-1)..0 lam MainChart hien khac han ban goc). Moi
  // du lieu Nhom 1 (Fan Chart/Timing Forecast) dung `forwardSeries` RIENG
  // BIET (offset 0..+60), KHONG DUNG DEN alignedSeries.
  alignedSeries: SeriesPoint[];
  // MOI (Nhom 1): dien bien SAU KHI mau hinh ket thuc, base=100 TAI DIEM
  // KET THUC mau hinh, offset 0..+60. Dung rieng cho Fan Chart/Timing
  // Forecast - KHONG anh huong gi den MainChart/alignedSeries.
  forwardSeries: SeriesPoint[];
  returns: Record<(typeof FORWARD_HORIZONS)[number], number>; // % thay doi N phien SAU khi ket thuc mau hinh
  forwardMaxDrawdownPct: number; // muc sut giam toi da trong 60 phien sau do (gia tri <= 0)
}

/**
 * Tim toi da K giai doan lich su co mau hinh gia GIONG NHAT voi cua so
 * hien tai (windowSize phien cuoi cung cua `bars`), dung DTW tren chuoi da
 * chuan hoa base=100.
 *
 * Rang buoc: cac ung vien KHONG duoc chong lan voi cua so hien tai, va
 * PHAI co du du lieu 60 phien ke tiep de tinh returns/drawdown day du
 * (loai bo cac ung vien qua gan hien tai chua co du du lieu tuong lai).
 */
export function findTopKCycles(bars: OhlcvBar[], windowSize: number, k: number = 5): CycleMatchResult[] {
  const closes = bars.map((b) => b.close);
  const L = closes.length;
  if (L < windowSize * 2 + MAX_FORWARD_HORIZON) return []; // khong du du lieu de quet co y nghia

  const currentWindowStartIdx = L - windowSize;
  const currentWindowRaw = closes.slice(currentWindowStartIdx, L);
  const currentWindowNorm = normalizeToBase100(currentWindowRaw);

  // Ung vien: end < currentWindowStartIdx (khong cham cua so hien tai) VA
  // end + MAX_FORWARD_HORIZON < L (con du du lieu tuong lai de tinh returns)
  const maxCandidateEndExclusive = Math.min(currentWindowStartIdx, L - MAX_FORWARD_HORIZON);

  const scored: { startIndex: number; endIndex: number; distance: number }[] = [];
  for (let start = 0; start + windowSize <= maxCandidateEndExclusive; start++) {
    const end = start + windowSize; // exclusive
    const slice = closes.slice(start, end);
    const norm = normalizeToBase100(slice);
    const distance = dtwDistance(currentWindowNorm, norm);
    scored.push({ startIndex: start, endIndex: end - 1, distance });
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => a.distance - b.distance);

  // FIX QUAN TRONG (2026-09-12): TRUOC DAY chi lay k phan tu dau tien theo
  // khoang cach - nhung vi cua so truot 1 phien 1 lan, cac ung vien LIEN
  // TIEP (VD startIndex=1032,1033,1034) la BAN SAO GAN NHU Y HET cua CUNG 1
  // giai doan lich su (chi lech vai ngay), KHONG PHAI cac giai doan doc
  // lap. Da xac nhan qua du lieu that: pool 20 "ung vien" thuc chat chi co
  // ~6-7 giai doan THAT, moi giai doan bi dem lap 2-5 lan - lam sai lech ca
  // Fan Chart/Timing Forecast (phong dai do tin cay thong ke gia tao) LAN
  // Cluster Panel (HDBSCAN thay qua nhieu "ban sao" gan nhau, coi la
  // "nhieu" vi cum qua nho). Sua bang non-maximum suppression: bo qua ung
  // vien qua GAN (chong lan) voi ung vien DA CHON, dam bao k ung vien cuoi
  // cung la k GIAI DOAN LICH SU THAT SU KHAC BIET.
  const MIN_GAP_BETWEEN_CANDIDATES = windowSize;
  const top: typeof scored = [];
  for (const cand of scored) {
    if (top.length >= k) break;
    const tooClose = top.some((s) => Math.abs(s.startIndex - cand.startIndex) < MIN_GAP_BETWEEN_CANDIDATES);
    if (!tooClose) top.push(cand);
  }

  // Chuan hoa similarityPct THEO PHAM VI DA QUET (min-max trong chinh lan
  // quet nay) - khong phai 1 thang do tuyet doi co san, vi "khoang cach DTW
  // bao nhieu la giong" phu thuoc do bien dong rieng cua tung ma.
  const allDistances = scored.map((s) => s.distance);
  const dMin = Math.min(...allDistances);
  const dMax = Math.max(...allDistances);
  const distanceRange = Math.max(dMax - dMin, 1e-9);

  return top.map((cand) => {
    const matchEndIdxExclusive = cand.endIndex + 1;
    // Mau hinh (pattern) - offset 0..windowSize-1 (0 = DAU cua so) - GIU
    // NGUYEN Y HET ban Giai doan 1 goc, KHONG DOI.
    const alignedSlice = closes.slice(cand.startIndex, matchEndIdxExclusive);
    const alignedNorm = normalizeToBase100(alignedSlice);
    const alignedSeries: SeriesPoint[] = alignedNorm.map((v, i) => ({ sessionOffset: i, normalizedClose: v }));

    const priceAtMatchEnd = closes[cand.endIndex];

    // MOI (Nhom 1): dien bien SAU DO, base=100 TAI DIEM KET THUC mau hinh,
    // offset 0..+60 - hoan toan tach biet voi alignedSeries o tren.
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

    // Max drawdown THAT trong 60 phien sau do (khong chi 4 diem roi rac d10/20/30/60)
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
  similarity: number; // 0-1
  liquidity: number; // 0-1, ESTIMATED (xem ghi chu trong ham)
  regime: number; // 0-1
  sampleSize: number; // 0-1
  overall: number; // 0-1
}

export function computeQualityScore(
  matches: CycleMatchResult[],
  bars: OhlcvBar[],
  regimeConfidence: number,
): QualityScoreResult {
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
  winRatePct: number;
  avgReturnPct: number;
  maxDrawdownPct: number; // gia tri am (hoac 0) - kich ban xau nhat trong top match
  sampleCount: number;
}

export function computeSummaryStats(matches: CycleMatchResult[]): SummaryStatsResult {
  if (matches.length === 0) {
    return { winRatePct: 0, avgReturnPct: 0, maxDrawdownPct: 0, sampleCount: 0 };
  }
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

export { detectMarketRegime, calculateAtrSeries };

// ============================================================
// FAN CHART (P10-P90) - NHOM 1
// Dai xac suat tai TUNG phien SAU KHI mau hinh ket thuc, tinh tu phan vi
// (percentile) cua forwardSeries qua toan bo pool match - hoan toan doc
// lap voi alignedSeries/MainChart, hien thi o component RIENG.
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
// TIMING FORECAST - NHOM 1
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
// EXPLAINABILITY - NHOM 1
// ============================================================

export interface ExplainFactorResult { name: string; contributionPct: number; description: string; }

// ============================================================
// PAIRWISE DISTANCE MATRIX (cho Cluster Panel - HDBSCAN) - NHOM 2
// Tinh khoang cach DTW giua TUNG CAP trong pool ung vien (khong phai giua
// tung ung vien voi cua so hien tai nhu findTopKCycles da lam) - dung lam
// dau vao cho HDBSCAN (metric="precomputed") o Python endpoint rieng.
// KHONG tinh lai DTW o Python - dung DUNG NGUYEN so lieu da tinh o day,
// tranh trung lap logic giua 2 ngon ngu.
// ============================================================

export function computePairwiseDistanceMatrix(matches: CycleMatchResult[]): number[][] {
  const n = matches.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const series = matches.map((m) => m.alignedSeries.map((p) => p.normalizedClose));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = dtwDistance(series[i], series[j]);
      matrix[i][j] = d;
      matrix[j][i] = d; // DTW la doi xung: DTW(a,b) = DTW(b,a)
    }
  }
  return matrix;
}

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
