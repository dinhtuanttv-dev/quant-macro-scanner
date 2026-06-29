import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import {
  extractCloses, calculateSMA, classifyMa50Status, calculateRelativeStrength,
  calculateVolumeSpikeRatio,
} from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";

// Next.js API Route (Serverless Function) - tuan thu nguyen tac Vercel:
// - Tap trung goi Yahoo Finance MOT LAN tai server, tra ve ket qua da
//   tinh san (TA indicators) cho client, tranh client tu goi 10+ request
//   truc tiep den Yahoo (rui ro rate-limit + cham).
// - Gioi han so luong ma xu ly mac dinh de tranh timeout serverless,
//   co the goi them tham so ?limit= de dieu chinh.

export const maxDuration = 60; // Yahoo can goi tuan tu nhieu ma, can du thoi gian

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Number(limitParam), stockUniverse.length) : 10;

  const tickersToFetch = stockUniverse.slice(0, limit).map((s) => s.ticker);

  try {
    // Lay VN-Index truoc de tinh Relative Strength
    const vnIndexResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
    const vnIndexCloses = vnIndexResult.success && vnIndexResult.data ? extractCloses(vnIndexResult.data) : [];
    const vnIndexLatestClose = vnIndexCloses.length > 0 ? vnIndexCloses[vnIndexCloses.length - 1] : null;

    const results: MarketDataTicker[] = [];

    // Goi TUAN TU (khong Promise.all) de giam rui ro bi Yahoo rate-limit
    // khi xu ly nhieu ma lien tiep tu 1 serverless function.
    for (const ticker of tickersToFetch) {
      const ohlcvResult = await fetchOhlcvHistory(ticker, "6mo");

      if (!ohlcvResult.success || !ohlcvResult.data) {
        results.push({
          ticker,
          latestClose: null,
          ma50: null,
          ma50Status: "safe",
          relativeStrength3m: null,
          volumeSpikeRatio: null,
          error: ohlcvResult.error,
        });
        continue;
      }

      const bars = ohlcvResult.data;
      const closes = extractCloses(bars);
      const ma50 = calculateSMA(closes, 50);
      const ma50Status = classifyMa50Status(closes);
      const rs3m = calculateRelativeStrength(closes, vnIndexCloses, 60); // ~3 thang giao dich
      const volSpike = calculateVolumeSpikeRatio(bars, 20);

      results.push({
        ticker,
        latestClose: closes.length > 0 ? closes[closes.length - 1] : null,
        ma50,
        ma50Status,
        relativeStrength3m: rs3m,
        volumeSpikeRatio: volSpike,
      });

      // Nghi ngan giua cac request de giam rui ro rate-limit tu Yahoo
      await new Promise((r) => setTimeout(r, 150));
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