import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchVN30VN100Universe } from "@/lib/market-data/vci-listing-adapter";
import { applyMarketFilter } from "@/lib/ta-command-center/detectors/marketFilter";
import { scanAllPatterns, type PatternMatch } from "@/lib/ta-command-center/detectors/patternScanner";
import { stockUniverse } from "@/lib/quant-data";

export const maxDuration = 10;
// Tang BATCH_SIZE (so voi 8 truoc day) de xu ly ~180 ma (VN30+VN100)
// van nam trong gioi han 10s cua Vercel Hobby.
const BATCH_SIZE = 18;
const BATCH_DELAY_MS = 150;

export interface PatternScanResponse {
  generatedAt: string;
  universeSource: "VN30_VN100" | "FALLBACK_60";
  totalUniverse: number;
  eligibleCount: number;
  matches: (PatternMatch & { preFilter: { avgVolume: number; aboveMA200: boolean } })[];
}

// sectorMap fallback tu stockUniverse da co (60 ma) - cho ma nao khong
// co trong danh sach nay se hien "-" thay vi loi.
const sectorMap: Record<string, string> = {};
stockUniverse.forEach((s) => { sectorMap[s.ticker] = s.sector; });

export async function GET() {
  // Uu tien lay universe thuc VN30+VN100. Neu VCI loi (mang, doi API...),
  // fallback ve 60 ma san co de trang khong bao gio trang hoan toan.
  const universeResult = await fetchVN30VN100Universe();
  const tickers = universeResult.success && universeResult.data ? universeResult.data : stockUniverse.map((s) => s.ticker);
  const universeSource: PatternScanResponse["universeSource"] = universeResult.success ? "VN30_VN100" : "FALLBACK_60";

  const matches: PatternScanResponse["matches"] = [];
  let eligibleCount = 0;

  try {
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
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
      universeSource,
      totalUniverse: tickers.length,
      eligibleCount,
      matches,
    } as PatternScanResponse);
  } catch (err) {
    console.error("[api/pattern-scan] Loi:", err);
    return NextResponse.json({ error: "Khong the quet pattern luc nay." }, { status: 500 });
  }
}