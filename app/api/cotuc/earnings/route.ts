import { NextResponse } from "next/server";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { calculateEarningsGrowth, rankBestEarnings, estimateNextDisclosureDeadline } from "@/lib/cotuc/earnings-scoring";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

export const maxDuration = 10;

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const financialsResults = await fetchQuarterlyIncomeBatch(tickers);

    const growthResults = financialsResults
      .filter((r) => r.available)
      .map((r) => calculateEarningsGrowth(r.ticker, r.quarters))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const rankedTop20 = rankBestEarnings(growthResults, 20);
    const deadline = estimateNextDisclosureDeadline();

    const failedTickers = financialsResults.filter((r) => !r.available).map((r) => r.ticker);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      totalAvailable: growthResults.length,
      failedTickers,
      deadline,
      rankedTop20,
    });
  } catch (err) {
    console.error("[api/cotuc/earnings] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu KQKD lúc này." }, { status: 500 });
  }
}
