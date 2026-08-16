import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchVN30VN100Universe } from "@/lib/market-data/vci-listing-adapter";
import {
  extractCloses, calculateSMA, classifyMa50Status, calculateRelativeStrength,
  calculateVolumeSpikeRatio,
} from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";

export const maxDuration = 10;
const BATCH_SIZE = 18;
const BATCH_DELAY_MS = 150;
const REDIS_KEY = "market-data:latest";

export interface MarketDataTicker {
  ticker: string;
  latestClose: number | null;
  ma50: number | null;
  ma50Status: "safe" | "warning" | "broken";
  relativeStrength3m: number | null;
  volumeSpikeRatio: number | null;
  error?: string;
}

async function fetchOneTicker(ticker: string, vnIndexCloses: number[]): Promise<MarketDataTicker> {
  const ohlcvResult = await fetchOhlcvHistory(ticker, "6mo");
  if (!ohlcvResult.success || !ohlcvResult.data) {
    return {
      ticker, latestClose: null, ma50: null, ma50Status: "safe",
      relativeStrength3m: null, volumeSpikeRatio: null, error: ohlcvResult.error,
    };
  }
  const bars = ohlcvResult.data;
  const closes = extractCloses(bars);
  const ma50 = calculateSMA(closes, 50);
  const ma50Status = classifyMa50Status(closes);
  const rs3m = calculateRelativeStrength(closes, vnIndexCloses, 60);
  const volSpike = calculateVolumeSpikeRatio(bars, 20);
  return {
    ticker, latestClose: closes.length > 0 ? closes[closes.length - 1] : null,
    ma50, ma50Status, relativeStrength3m: rs3m, volumeSpikeRatio: volSpike,
  };
}

// Route chi duoc goi boi GitHub Actions (thay vi Vercel Cron - Vercel Hobby
// chi cho phep cron 1 lan/ngay, khong du de lam moi du lieu thi truong).
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const universeResult = await fetchVN30VN100Universe();
    const tickers = universeResult.success && universeResult.data
      ? universeResult.data
      : stockUniverse.map((s) => s.ticker);
    const universeSource = universeResult.success ? "VN30_VN100" : "FALLBACK_60";

    const vnIndexResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
    const vnIndexCloses = vnIndexResult.success && vnIndexResult.data ? extractCloses(vnIndexResult.data) : [];

    const results: MarketDataTicker[] = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((t) => fetchOneTicker(t, vnIndexCloses)));
      results.push(...batchResults);
      if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      universeSource,
      totalUniverse: tickers.length,
      vnIndexLatestClose: vnIndexCloses.length > 0 ? vnIndexCloses[vnIndexCloses.length - 1] : null,
      tickers: results,
    };

    await kv.set(REDIS_KEY, payload);

    return NextResponse.json({ ok: true, scannedAt: payload.generatedAt, tickerCount: results.length, universeSource });
  } catch (err) {
    console.error("[api/market-data/scan] Loi:", err);
    return NextResponse.json({ error: "Khong the quet du lieu thi truong luc nay." }, { status: 500 });
  }
}
