// Market Filter - Pre-filter toan thi truong TRUOC KHI quet pattern.
// HARD_DATA: Vol trung binh 20 phien > 500,000 CP VA gia dong cua
// hien tai > MA200. Giam nhieu, chi giu ma du thanh khoan + dang
// trong xu huong tang dai han.

import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";
import { calculateSMA } from "@/lib/market-data/technical-indicators";

export interface MarketFilterResult {
  passed: boolean;
  avgVolume20d: number;
  aboveMA200: boolean;
  ma200: number | null;
}

const MIN_AVG_VOLUME = 500000;

export function applyMarketFilter(bars: OhlcvBar[]): MarketFilterResult {
  if (bars.length < 200) {
    return { passed: false, avgVolume20d: 0, aboveMA200: false, ma200: null };
  }
  const recent20 = bars.slice(-20);
  const avgVolume20d = recent20.reduce((s, b) => s + b.volume, 0) / recent20.length;
  const closes = bars.map((b) => b.close);
  const ma200 = calculateSMA(closes, 200);
  const currentClose = closes[closes.length - 1];
  const aboveMA200 = ma200 !== null && currentClose > ma200;
  const passed = avgVolume20d > MIN_AVG_VOLUME && aboveMA200;
  return { passed, avgVolume20d: Math.round(avgVolume20d), aboveMA200, ma200 };
}