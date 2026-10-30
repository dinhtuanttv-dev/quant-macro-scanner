import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchIndexOhlcvHistory } from "@/lib/market-data/vndirect-adapter";

import { withCdnCache } from "@/lib/http/cdnCache";
export const maxDuration = 10;

const INDEX_TICKERS = new Set(["VNINDEX", "VN-INDEX", "HNXINDEX", "HNX-INDEX"]);

async function getUncached(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") ?? "3mo";
  const limit = Number(searchParams.get("limit") ?? "30");

  if (!ticker) {
    return NextResponse.json({ error: "Thieu tham so ticker." }, { status: 400 });
  }

  const normalized = ticker.trim().toUpperCase();
  const isIndex = INDEX_TICKERS.has(normalized);

  const result = isIndex
    ? await fetchIndexOhlcvHistory(normalized.replace("-", ""), 120)
    : await fetchOhlcvHistory(ticker, range);

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Khong lay duoc du lieu OHLCV." },
      { status: 502 }
    );
  }

  const recentBars = result.data.slice(-limit);
  return NextResponse.json({ ticker, bars: recentBars });
}

/** CDN của Vercel trả lượt gọi lặp lại trong 60 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 60);
