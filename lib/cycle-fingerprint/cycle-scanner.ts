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

export interface CycleMatchResult {
  startIndex: number;
  endIndex: number; // inclusive
  matchStartDate: string;
  matchEndDate: string;
  distance: number;
  similarityPct: number; // 0-100, da chuan hoa trong pham vi lan quet nay
  alignedSeries: { sessionOffset: number; normalizedClose: number }[]; // base=100 tai diem khop
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
  const top = scored.slice(0, k);

  // Chuan hoa similarityPct THEO PHAM VI DA QUET (min-max trong chinh lan
  // quet nay) - khong phai 1 thang do tuyet doi co san, vi "khoang cach DTW
  // bao nhieu la giong" phu thuoc do bien dong rieng cua tung ma.
  const allDistances = scored.map((s) => s.distance);
  const dMin = Math.min(...allDistances);
  const dMax = Math.max(...allDistances);
  const distanceRange = Math.max(dMax - dMin, 1e-9);

  return top.map((cand) => {
    const matchEndIdxExclusive = cand.endIndex + 1;
    const alignedSlice = closes.slice(cand.startIndex, matchEndIdxExclusive);
    const alignedNorm = normalizeToBase100(alignedSlice);
    const alignedSeries = alignedNorm.map((v, i) => ({ sessionOffset: i, normalizedClose: v }));

    const priceAtMatchEnd = closes[cand.endIndex];
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
