// Cong thuc xep hang Top 200 - PORT tu vn_stock_pipeline/config.py +
// pipeline.py: Score = W1*norm(MarketCap) + W2*norm(Volume30D), chuan
// hoa min-max trong tap ung vien DA QUA dieu kien loc ky thuat.

import type { TvScannerRow } from "./tradingview-scanner";

export const WEIGHT_MARKET_CAP = 0.4;
export const WEIGHT_VOLUME = 0.6;
export const MIN_VOLUME = 100_000;                // CP/phien
export const MIN_TRADING_VALUE = 2_000_000_000;   // VND/phien (Close x Volume)
export const INCLUDED_EXCHANGES = ["HOSE", "HNX"];

export interface RankedStock {
  ticker: string; name: string; exchange: string; sector: string | null;
  close: number; changePercent: number; volume: number; marketCap: number;
  score: number; rank: number;
}

function minMaxNormalize(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return () => 0.5;
  return (v: number) => (v - min) / (max - min);
}

/**
 * Loc dieu kien thanh khoan + san giao dich, roi xep hang theo Score,
 * lay Top N (mac dinh 200). GIU NGUYEN cong thuc va nguong tu ban goc.
 */
export function rankTop200(rows: TvScannerRow[], topN = 200): RankedStock[] {
  const filtered = rows.filter((r) =>
    r.close !== null && r.volume !== null && r.marketCap !== null &&
    INCLUDED_EXCHANGES.some((ex) => r.exchange?.toUpperCase().includes(ex)) &&
    r.volume >= MIN_VOLUME &&
    r.close * r.volume >= MIN_TRADING_VALUE
  ) as (TvScannerRow & { close: number; volume: number; marketCap: number })[];

  if (filtered.length === 0) return [];

  const normCap = minMaxNormalize(filtered.map((r) => r.marketCap));
  const normVol = minMaxNormalize(filtered.map((r) => r.volume));

  const scored = filtered.map((r) => ({
    ticker: r.ticker.split(":").pop() ?? r.ticker, // "HOSE:VNM" -> "VNM"
    name: r.name, exchange: r.exchange, sector: r.sector, close: r.close,
    changePercent: r.changePercent ?? 0, volume: r.volume, marketCap: r.marketCap,
    score: Math.round((WEIGHT_MARKET_CAP * normCap(r.marketCap) + WEIGHT_VOLUME * normVol(r.volume)) * 10000) / 10000,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }));
}
