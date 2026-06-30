import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import {
  extractCloses, calculateSMA, classifyMa50Status, calculateRelativeStrength,
  calculateVolumeSpikeRatio,
} from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";

// Next.js API Route (Serverless Function) - tuan thu nguyen tac Vercel:
// - Tap trung goi Yahoo Finance tai server, tra ve ket qua da tinh san
//   (TA indicators) cho client.
// - QUAN TRONG: Vercel Hobby (free) gioi han serverless function toi da
//   10 GIAY. Vi vay KHONG goi tuan tu tung ma mot (qua cham voi 60 ma),
//   ma goi SONG SONG theo BATCH NHO de vua nhanh (duoi 10s) vua giam
//   rui ro bi Yahoo rate-limit (429) so voi goi toan bo 60 ma cung luc.

export const maxDuration = 10; // Khop voi gioi han thuc te cua Vercel Hobby

export interface MarketDataTicker {
  ticker: string;
  latestClose: number | null;
  ma50: number | null;
  ma50Status: "safe" | "warning" | "broken";
  relativeStrength3m: number | null;
  volumeSpikeRatio: number | null;
  error?: string;
}

export interface MarketDataResponse {
  generatedAt: string;
  vnIndexLatestClose: number | null;
  tickers: MarketDataTicker[];
}

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 250;

async function fetchOneTicker(ticker: string, vnIndexCloses: number[]): Promise<MarketDataTicker> {
  const ohlcvResult = await fetchOhlcvHistory(ticker, "6mo");

  if (!ohlcvResult.success || !ohlcvResult.data) {
    return {
      ticker,
      latestClose: null,
      ma50: null,
      ma50Status: "safe",
      relativeStrength3m: null,
      volumeSpikeRatio: null,
      error: ohlcvResult.error,
    };
  }

  const bars = ohlcvResult.data;
  const closes = extractCloses(bars);
  const ma50 = calculateSMA(closes, 50);
  const ma50Status = classifyMa50Status(closes);
  const rs3m = calculateRelativeStrength(closes, vnIndexCloses, 60);
  const volSpike = calculateVolumeSpikeRatio(bars, 20);

  return {
    ticker,
    latestClose: closes.length > 0 ? closes[closes.length - 1] : null,
    ma50,
    ma50Status,
    relativeStrength3m: rs3m,
    volumeSpikeRatio: volSpike,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam), stockUniverse.length) : stockUniverse.length;

  const tickersToFetch = stockUniverse.slice(0, limit).map((s) => s.ticker);

  try {
    const vnIndexResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
    const vnIndexCloses = vnIndexResult.success && vnIndexResult.data ? extractCloses(vnIndexResult.data) : [];
    const vnIndexLatestClose = vnIndexCloses.length > 0 ? vnIndexCloses[vnIndexCloses.length - 1] : null;

    const results: MarketDataTicker[] = [];

    for (let i = 0; i < tickersToFetch.length; i += BATCH_SIZE) {
      const batch = tickersToFetch.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((ticker) => fetchOneTicker(ticker, vnIndexCloses))
      );
      results.push(...batchResults);

      if (i + BATCH_SIZE < tickersToFetch.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    const response: MarketDataResponse = {
      generatedAt: new Date().toISOString(),
      vnIndexLatestClose,
      tickers: results,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[api/market-data] Loi khong xac dinh:", err);
    return NextResponse.json(
      { error: "Khong the lay du lieu thi truong luc nay." },
      { status: 500 }
    );
  }
}