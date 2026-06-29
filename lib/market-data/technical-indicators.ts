// ============================================================
// TECHNICAL INDICATORS - hop nham tinh toan thuan tu OHLCV
// Tat ca ham la PURE FUNCTION: cung input luon ra cung output,
// khong goi network, khong side-effect -> de unit test doc lap.
// ============================================================

import type { OhlcvBar } from "./tcbs-adapter";

/** Simple Moving Average tai diem cuoi cung cua mang gia dong cua. */
export function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

/** % lech cua gia hien tai so voi MA(period). Duong = gia tren MA. */
export function percentVsMA(closes: number[], period: number): number | null {
  const ma = calculateSMA(closes, period);
  if (ma === null || ma === 0) return null;
  const lastClose = closes[closes.length - 1];
  return Math.round(((lastClose - ma) / ma) * 1000) / 10; // % voi 1 chu so sau dau phay
}

export type Ma50Status = "safe" | "warning" | "broken";

/**
 * Xac dinh trang thai MA50 dua tren % lech thuc te, KHONG gan tay.
 * Quy uoc: gia duoi MA50 > 3% lien tuc -> broken; trong khoang [-3%, 0%) -> warning.
 */
export function classifyMa50Status(closes: number[]): Ma50Status {
  const pct = percentVsMA(closes, 50);
  if (pct === null) return "safe"; // chua du du lieu -> khong ket luan tieu cuc
  if (pct < -3) return "broken";
  if (pct < 0) return "warning";
  return "safe";
}

/**
 * Relative Strength so voi benchmark (vd VN-Index) trong N ngay.
 * RS = (% thay doi cua co phieu) - (% thay doi cua benchmark) trong cung ky.
 */
export function calculateRelativeStrength(
  stockCloses: number[],
  benchmarkCloses: number[],
  periodDays: number
): number | null {
  if (stockCloses.length < periodDays + 1 || benchmarkCloses.length < periodDays + 1) {
    return null;
  }
  const stockStart = stockCloses[stockCloses.length - 1 - periodDays];
  const stockEnd = stockCloses[stockCloses.length - 1];
  const benchStart = benchmarkCloses[benchmarkCloses.length - 1 - periodDays];
  const benchEnd = benchmarkCloses[benchmarkCloses.length - 1];

  if (stockStart === 0 || benchStart === 0) return null;

  const stockPctChange = ((stockEnd - stockStart) / stockStart) * 100;
  const benchPctChange = ((benchEnd - benchStart) / benchStart) * 100;

  return Math.round((stockPctChange - benchPctChange) * 10) / 10;
}

/** Ty le khoi luong phien gan nhat so voi khoi luong trung binh N phien truoc do. */
export function calculateVolumeSpikeRatio(bars: OhlcvBar[], avgPeriod: number = 20): number | null {
  if (bars.length < avgPeriod + 1) return null;
  const recentVolumes = bars.slice(bars.length - 1 - avgPeriod, bars.length - 1).map((b) => b.volume);
  const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  if (avgVolume === 0) return null;
  const latestVolume = bars[bars.length - 1].volume;
  return Math.round((latestVolume / avgVolume) * 100) / 100;
}

/** Trich danh sach gia dong cua tu mang OHLCV, theo thu tu thoi gian tang dan. */
export function extractCloses(bars: OhlcvBar[]): number[] {
  return bars.map((b) => b.close);
}