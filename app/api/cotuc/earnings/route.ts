import { NextResponse } from "next/server";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { calculateEarningsGrowth, rankBestEarnings, estimateNextDisclosureDeadline } from "@/lib/cotuc/earnings-scoring";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// FIX P0 (2026-09-12): 10s qua thap cho 17 request song song toi VCI - rui
// ro timeout giong het cac route khac da gap trong du an (Loc nganh, HOSE
// ingest). Tang len 30s.
export const maxDuration = 30;

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

    const failedResults = financialsResults.filter((r) => !r.available);
    const failedTickers = failedResults.map((r) => r.ticker);
    // FIX P0: du lieu loi CHI TIET (r.error) da co san o tang adapter tu
    // truoc, nhung CHUA TUNG duoc dua vao response - khien UI (da viet san
    // phan "Xem ly do chi tiet") khong bao gio hien duoc gi. Bo sung field
    // nay, khong doi logic gi khac.
    const errors = failedResults.map((r) => ({ ticker: r.ticker, reason: r.error ?? "Không rõ nguyên nhân" }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      totalAvailable: growthResults.length,
      failedTickers,
      errors,
      deadline,
      rankedTop20,
    });
  } catch (err) {
    console.error("[api/cotuc/earnings] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu KQKD lúc này." }, { status: 500 });
  }
}
