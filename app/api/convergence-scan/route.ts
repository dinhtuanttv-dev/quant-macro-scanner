import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchVN30VN100Universe } from "@/lib/market-data/vci-listing-adapter";
import { applyMarketFilter } from "@/lib/ta-command-center/detectors/marketFilter";
import { computeConvergence, type ConvergenceResult } from "@/lib/ta-command-center/detectors/convergenceEngine";
import { stockUniverse } from "@/lib/quant-data";

export const maxDuration = 10;
const BATCH_SIZE = 18;
const BATCH_DELAY_MS = 150;

const sectorMap: Record<string, string> = {};
stockUniverse.forEach((s) => { sectorMap[s.ticker] = s.sector; });

export async function GET() {
  const universeResult = await fetchVN30VN100Universe();
  const tickers = universeResult.success && universeResult.data
    ? universeResult.data
    : stockUniverse.map((s) => s.ticker);
  const universeSource = universeResult.success ? "VN30_VN100" : "FALLBACK_60";

  const results: ConvergenceResult[] = [];

  try {
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((t) => fetchOhlcvHistory(t, "1y")));

      batchResults.forEach((res, bi) => {
        const ticker = batch[bi];
        if (!res.success || !res.data || res.data.length < 200) return;
        const filterResult = applyMarketFilter(res.data);
        if (!filterResult.passed) return;
        const conv = computeConvergence(res.data, ticker, sectorMap[ticker] ?? "-");
        if (conv) results.push(conv);
      });

      if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    results.sort((a, b) => b.compositeScore - a.compositeScore);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      universeSource, totalUniverse: tickers.length, results,
    });
  } catch (err) {
    console.error("[api/convergence-scan] Loi:", err);
    return NextResponse.json({ error: "Khong the quet hop luu luc nay." }, { status: 500 });
  }
}
