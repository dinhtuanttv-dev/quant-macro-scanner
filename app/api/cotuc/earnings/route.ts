import { NextResponse } from "next/server";
import { calculateEarningsGrowth, rankBestEarnings, estimateNextDisclosureDeadline } from "@/lib/cotuc/earnings-scoring";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { fetchVndFundamentalsBulk, toQuarterlyIncomeRows } from "@/lib/cotuc/vndirect-fundamentals";

// "📈 KQKD Theo Quý": tăng trưởng doanh thu/LNST (YoY, QoQ) cho cả danh mục Siêu Quét (~300 mã) từ BCTC quý VNDirect.
// Thay nguồn VCI (403 từ 10/2026 -> 17/17 mã lỗi). Giữ nguyên hợp đồng cũ và logic chấm điểm earnings-scoring.ts.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const universe = await getCotucUniverse();
    const tickers = universe.tickers.map((t) => t.ticker);
    const { statements, errors: fetchErrors } = await fetchVndFundamentalsBulk(tickers);

    const growthResults = tickers
      .map((t) => calculateEarningsGrowth(t, toQuarterlyIncomeRows(t, statements.get(t) ?? [])))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const available = new Set(growthResults.map((r) => r.ticker));
    const failedTickers = tickers.filter((t) => !available.has(t));

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        source: "VNDIRECT",
        totalRequested: tickers.length,
        totalAvailable: growthResults.length,
        failedTickers,
        errors: [
          ...fetchErrors.map((reason) => ({ ticker: "*", reason })),
          ...failedTickers.map((ticker) => ({ ticker, reason: "VNDirect chưa có BCTC quý" })),
        ],
        deadline: estimateNextDisclosureDeadline(),
        rankedTop20: rankBestEarnings(growthResults, 20),
      },
      { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200" } },
    );
  } catch (err) {
    console.error("[api/cotuc/earnings] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu KQKD lúc này." }, { status: 500 });
  }
}
