import { NextResponse } from "next/server";
import { fetchQuoteBatch } from "@/lib/market-data/yahoo-finance-adapter";
import { stockUniverse } from "@/lib/quant-data";

// Vercel Hobby gioi han 10s - fetchQuoteBatch da tu chia BATCH_SIZE=15 va
// goi Promise.all song song trong tung batch, phu hop voi so luong ma
// trong stockUniverse (thuong duoi 60 ma).
export const maxDuration = 10;

export async function GET() {
  try {
    const tickers = stockUniverse.map((s) => s.ticker);
    const quotes = await fetchQuoteBatch(tickers);

    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    let noData = 0;

    for (const ticker of tickers) {
      const q = quotes[ticker];
      if (!q || q.price === null || q.changePct === null) {
        noData++;
        continue;
      }
      if (q.changePct > 0) advancers++;
      else if (q.changePct < 0) decliners++;
      else unchanged++;
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      advancers,
      decliners,
      unchanged,
      noData,
      totalUniverse: tickers.length,
    });
  } catch (err) {
    console.error("[api/market-data/breadth] Loi:", err);
    return NextResponse.json(
      { error: "Khong tinh duoc do rong thi truong." },
      { status: 500 }
    );
  }
}
