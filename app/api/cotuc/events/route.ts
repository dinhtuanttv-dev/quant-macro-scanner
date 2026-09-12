import { NextResponse } from "next/server";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// FIX P0 (2026-09-12): 10s qua thap cho 17 request song song toi VCI.
export const maxDuration = 30;

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const results = await fetchDividendEventsBatch(tickers);
    const successCount = results.filter((r) => r.available).length;

    // P1: them field MOI "lifecycleEvents" (5 moc thuc te da chuan hoa +
    // phan loai CASH/STOCK_DIVIDEND/BONUS_ISSUE/ESOP) - CHI THEM, khong
    // xoa cac field cu (exDividendEvents/agmEvents) de khong pha vo
    // useDividendEvents.ts dang dung. Bo "rawEvents" khoi response cuoi
    // (chi dung noi bo de build lifecycleEvents) - tranh payload thua.
    const resultsWithLifecycle = results.map((r) => {
      const { rawEvents, ...rest } = r;
      return {
        ...rest,
        lifecycleEvents: r.available ? buildLifecycleEvents(r.ticker, rawEvents) : [],
      };
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      successCount,
      results: resultsWithLifecycle,
    });
  } catch (err) {
    console.error("[api/cotuc/events] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải sự kiện GDKHQ/ĐHCĐ lúc này." }, { status: 500 });
  }
}
