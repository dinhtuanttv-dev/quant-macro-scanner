// lib/catalyst/marketSignals.ts
// Nối MarketSignal với dữ liệu giá/khối lượng THẬT — nhưng chỉ nối đúng những field
// project thực sự có nguồn dữ liệu. Các field không có nguồn được giữ mặc định trung lập
// và ghi chú rõ, KHÔNG bịa số để trông như có dữ liệu thật.
//
// Có dữ liệu thật: priceInStatus (proxy qua Relative Strength), volumeFlag (Volume Spike Ratio)
// CHƯA có dữ liệu: foreignFlowDirection (tcbs-adapter không có field khối ngoại),
//                  valuationPercentile (chưa có route /api/fundamentals),
//                  liquidityScore (volumeSpikeRatio đo đột biến tương đối, không phải
//                  thanh khoản tuyệt đối — không thể suy ra chính xác từ đó)

import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses, calculateRelativeStrength, calculateVolumeSpikeRatio } from "@/lib/market-data/technical-indicators";
import type { MarketSignal } from "./types";

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

function inferPriceInStatus(rs3m: number | null): "reflected" | "not_reflected" {
  if (rs3m === null) return "not_reflected";
  return rs3m > 5 ? "reflected" : "not_reflected";
}

function inferVolumeFlag(volumeSpikeRatio: number | null): "confirmed" | "suspicious" | "none" {
  if (volumeSpikeRatio === null) return "none";
  return volumeSpikeRatio >= 1.5 ? "confirmed" : "none";
}

export async function fetchMarketSignalsReal(tickers: string[]): Promise<Map<string, MarketSignal>> {
  const map = new Map<string, MarketSignal>();
  if (tickers.length === 0) return map;

  const vnIndexResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
  const vnIndexCloses =
    vnIndexResult.success && vnIndexResult.data ? extractCloses(vnIndexResult.data) : [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        const ohlcvResult = await fetchOhlcvHistory(ticker, "6mo");
        if (!ohlcvResult.success || !ohlcvResult.data) {
          return { ticker, rs3m: null, volumeSpikeRatio: null };
        }
        const closes = extractCloses(ohlcvResult.data);
        const rs3m = calculateRelativeStrength(closes, vnIndexCloses, 60);
        const volumeSpikeRatio = calculateVolumeSpikeRatio(ohlcvResult.data, 20);
        return { ticker, rs3m, volumeSpikeRatio };
      })
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { ticker, rs3m, volumeSpikeRatio } = result.value;

      map.set(ticker, {
        ticker,
        priceInStatus: inferPriceInStatus(rs3m),
        volumeFlag: inferVolumeFlag(volumeSpikeRatio),
        foreignFlowDirection: "none",
        valuationPercentile: 0.5,
        liquidityScore: 0.5,
        isWatchlisted: false,
      });
    }

    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  for (const ticker of tickers) {
    if (!map.has(ticker)) {
      map.set(ticker, {
        ticker,
        priceInStatus: "not_reflected",
        volumeFlag: "none",
        foreignFlowDirection: "none",
        valuationPercentile: 0.5,
        liquidityScore: 0.5,
        isWatchlisted: false,
      });
    }
  }

  return map;
}