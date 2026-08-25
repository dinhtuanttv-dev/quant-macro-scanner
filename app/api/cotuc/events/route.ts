import { NextResponse } from "next/server";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

export const maxDuration = 10;

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const results = await fetchDividendEventsBatch(tickers);
    const successCount = results.filter((r) => r.available).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      successCount,
      results,
    });
  } catch (err) {
    console.error("[api/cotuc/events] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải sự kiện GDKHQ/ĐHCĐ lúc này." }, { status: 500 });
  }
}
