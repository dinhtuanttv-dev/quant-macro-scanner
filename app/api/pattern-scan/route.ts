import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { applyMarketFilter } from "@/lib/ta-command-center/detectors/marketFilter";
import { scanAllPatterns, type PatternMatch } from "@/lib/ta-command-center/detectors/patternScanner";
import { stockUniverse } from "@/lib/quant-data";

export const maxDuration = 10;
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 200;

export interface PatternScanResponse {
  generatedAt: string;
  totalUniverse: number;
  eligibleCount: number;
  matches: (PatternMatch & { preFilter: { avgVolume: number; aboveMA200: boolean } })[];
}

export async function GET() {
  const tickers = stockUniverse.map((s) => s.ticker);
  const sectorMap: Record<string, string> = {};
  stockUniverse.forEach((s) => { sectorMap[s.ticker] = s.sector; });

  const matches: PatternScanResponse["matches"] = [];
  let eligibleCount = 0;

  try {
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      // range "1y" (khong phai "6mo") de co du >=200 phien tinh MA200
      const results = await Promise.all(batch.map((t) => fetchOhlcvHistory(t, "1y")));

      results.forEach((res, bi) => {
        const ticker = batch[bi];
        if (!res.success || !res.data || res.data.length < 200) return;

        const filterResult = applyMarketFilter(res.data);
        if (!filterResult.passed) return;
        eligibleCount++;

        const found = scanAllPatterns(res.data, ticker, sectorMap[ticker] ?? "-");
        found.forEach((m) => {
          matches.push({ ...m, preFilter: { avgVolume: filterResult.avgVolume20d, aboveMA200: filterResult.aboveMA200 } });
        });
      });

      if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    matches.sort((a, b) => b.confidenceScore - a.confidenceScore);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalUniverse: tickers.length,
      eligibleCount,
      matches,
    } as PatternScanResponse);
  } catch (err) {
    console.error("[api/pattern-scan] Loi:", err);
    return NextResponse.json({ error: "Khong the quet pattern luc nay." }, { status: 500 });
  }
}