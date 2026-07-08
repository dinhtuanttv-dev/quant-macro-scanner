// Pattern Scanner - nhan dien mo hinh ky thuat kinh dien tu OHLCV.
// HARD_DATA (rule-based): quy tac hinh hoc xac dinh, nguong dung
// sai la lua chon co chu dinh, khong phai chan ly tuyet doi. Cup &
// Handle bi gioi han diem tin cay thap hon vi do chu quan cao hon.

import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";
import { checkBollingerContraction } from "@/lib/market-data/technical-indicators";

export type PatternType = "INVERSE_HS" | "TRIANGLE" | "FLAT_SQUEEZE" | "CUP_HANDLE";

export interface PatternMatch {
  ticker: string;
  sector: string;
  pattern: PatternType;
  patternLabel: string;
  tag: string; // "{ticker}::{PATTERN}::{timeframe}" - de module khac tra cuu
  timeframe: "D" | "W";
  confidenceScore: number;
  status: "forming" | "confirmed";
  dateRangeStart: string;
  dateRangeEnd: string;
}

interface SwingPoint { index: number; price: number; type: "high" | "low"; date: string; }

function detectSwings(bars: OhlcvBar[], lookback: number = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const window = bars.slice(i - lookback, i + lookback + 1);
    if (window.every((b) => bars[i].high >= b.high)) swings.push({ index: i, price: bars[i].high, type: "high", date: bars[i].date });
    if (window.every((b) => bars[i].low <= b.low)) swings.push({ index: i, price: bars[i].low, type: "low", date: bars[i].date });
  }
  return swings;
}

function linearRegSlope(points: { x: number; y: number }[]): number {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Vai-Dau-Vai nguoc: 3 day (trough) lien tiep, day giua thap nhat, 2 vai lech nhau <8%. */
export function detectInverseHeadShoulders(bars: OhlcvBar[], ticker: string, sector: string): PatternMatch | null {
  const swings = detectSwings(bars, 5);
  const lows = swings.filter((s) => s.type === "low");
  if (lows.length < 3) return null;

  for (let i = 0; i <= lows.length - 3; i++) {
    const [leftShoulder, head, rightShoulder] = lows.slice(i, i + 3);
    if (head.price >= leftShoulder.price || head.price >= rightShoulder.price) continue;
    const shoulderDiff = Math.abs(leftShoulder.price - rightShoulder.price) / ((leftShoulder.price + rightShoulder.price) / 2);
    if (shoulderDiff > 0.08) continue;

    const highsBetween = swings.filter((s) => s.type === "high" && s.index > leftShoulder.index && s.index < rightShoulder.index);
    if (highsBetween.length < 1) continue;
    const necklinePrice = highsBetween.reduce((s, h) => s + h.price, 0) / highsBetween.length;

    const lastClose = bars[bars.length - 1].close;
    const status: "forming" | "confirmed" = lastClose > necklinePrice ? "confirmed" : "forming";

    let confidence = 50 + Math.max(0, (0.08 - shoulderDiff) / 0.08) * 25;
    if (status === "confirmed") confidence += 20;
    confidence = Math.min(95, Math.round(confidence));

    return {
      ticker, sector, pattern: "INVERSE_HS", patternLabel: "Vai-Đầu-Vai ngược",
      tag: `${ticker}::INVERSE_HS::D`, timeframe: "D", confidenceScore: confidence, status,
      dateRangeStart: leftShoulder.date, dateRangeEnd: rightShoulder.date,
    };
  }
  return null;
}

/** Tam giac hoi tu: dinh giam dan (regression am) VA day tang dan (regression duong). */
export function detectTriangle(bars: OhlcvBar[], ticker: string, sector: string): PatternMatch | null {
  const swings = detectSwings(bars, 4).slice(-16);
  const highs = swings.filter((s) => s.type === "high").map((s) => ({ x: s.index, y: s.price }));
  const lows = swings.filter((s) => s.type === "low").map((s) => ({ x: s.index, y: s.price }));
  if (highs.length < 3 || lows.length < 3) return null;

  const highSlope = linearRegSlope(highs);
  const lowSlope = linearRegSlope(lows);
  if (!(highSlope < 0 && lowSlope > 0)) return null;

  const startIdx = Math.min(highs[0].x, lows[0].x);
  let confidence = 45 + Math.min(30, Math.abs(highSlope) * 500) + Math.min(20, Math.abs(lowSlope) * 500);
  confidence = Math.min(90, Math.round(confidence));

  return {
    ticker, sector, pattern: "TRIANGLE", patternLabel: "Tam giác hội tụ",
    tag: `${ticker}::TRIANGLE::D`, timeframe: "D", confidenceScore: confidence, status: "forming",
    dateRangeStart: bars[startIdx]?.date ?? bars[0].date, dateRangeEnd: bars[bars.length - 1].date,
  };
}

/** Siet chat (Flat/Squeeze): tai su dung Bollinger Contraction da co san. */
export function detectFlatSqueeze(bars: OhlcvBar[], ticker: string, sector: string): PatternMatch | null {
  const closes = bars.map((b) => b.close);
  const contraction = checkBollingerContraction(closes, 20, 20);
  if (!contraction.isContracting) return null;

  const confidence = Math.min(90, Math.max(40, Math.round(100 - contraction.percentile * 2)));
  const startIdx = Math.max(0, bars.length - 20);

  return {
    ticker, sector, pattern: "FLAT_SQUEEZE", patternLabel: "Siết chặt (BB Squeeze)",
    tag: `${ticker}::FLAT_SQUEEZE::D`, timeframe: "D", confidenceScore: confidence, status: "forming",
    dateRangeStart: bars[startIdx].date, dateRangeEnd: bars[bars.length - 1].date,
  };
}

/** Coc tay cam (heuristic don gian, do tin cay gioi han <=75 vi chu quan cao). */
export function detectCupHandle(bars: OhlcvBar[], ticker: string, sector: string): PatternMatch | null {
  if (bars.length < 60) return null;
  const window = bars.slice(-60);
  const closes = window.map((b) => b.close);
  const leftPeak = Math.max(...closes.slice(0, 15));
  const rightPeak = Math.max(...closes.slice(-15));
  const cupBottom = Math.min(...closes.slice(15, 45));
  const peakDiff = Math.abs(leftPeak - rightPeak) / ((leftPeak + rightPeak) / 2);
  const cupDepth = (Math.min(leftPeak, rightPeak) - cupBottom) / Math.min(leftPeak, rightPeak);

  if (peakDiff > 0.1 || cupDepth < 0.1 || cupDepth > 0.5) return null;

  const handleBars = closes.slice(-8);
  const handleDip = (rightPeak - Math.min(...handleBars)) / rightPeak;
  if (handleDip > 0.15) return null;

  let confidence = 40 + Math.max(0, (0.1 - peakDiff) * 200) + Math.min(20, cupDepth * 60);
  confidence = Math.min(75, Math.round(confidence));

  return {
    ticker, sector, pattern: "CUP_HANDLE", patternLabel: "Cốc tay cầm",
    tag: `${ticker}::CUP_HANDLE::D`, timeframe: "D", confidenceScore: confidence, status: "forming",
    dateRangeStart: window[0].date, dateRangeEnd: window[window.length - 1].date,
  };
}

export function scanAllPatterns(bars: OhlcvBar[], ticker: string, sector: string): PatternMatch[] {
  const results: PatternMatch[] = [];
  const ihs = detectInverseHeadShoulders(bars, ticker, sector); if (ihs) results.push(ihs);
  const tri = detectTriangle(bars, ticker, sector); if (tri) results.push(tri);
  const flat = detectFlatSqueeze(bars, ticker, sector); if (flat) results.push(flat);
  const cup = detectCupHandle(bars, ticker, sector); if (cup) results.push(cup);
  return results;
}