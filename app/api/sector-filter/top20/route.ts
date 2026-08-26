import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses, calculateRelativeStrength, calculateVolumeSpikeRatio } from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";
import { rankTop20, type ConfluenceInput } from "@/lib/sector-filter/scoring/confluence-score";
import type { RRGQuadrant } from "@/lib/sector-filter/rrg/rrg-calculator";

export const maxDuration = 10;
const BATCH_SIZE = 18;

const TICKER_SECTOR_MAP: Record<string, string> = {};
stockUniverse.forEach((s: any) => { TICKER_SECTOR_MAP[s.ticker] = s.sector; });

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const filterSectorKey = searchParams.get("sectorKey");

  const rrgRes = await fetch(`${origin}/api/sector-filter/rrg`, { cache: "no-store" });
  const rrgData = await rrgRes.json();
  const quadrantMap: Record<string, RRGQuadrant> = {};
  rrgData?.points?.forEach((p: any) => { quadrantMap[p.sectorKey] = p.quadrant; });

  const vnResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
  const vnCloses = vnResult.success && vnResult.data ? extractCloses(vnResult.data) : [];

  const tickers = stockUniverse.map((s: any) => s.ticker);
  const inputs: ConfluenceInput[] = [];

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((t: string) => fetchOhlcvHistory(t, "6mo")));

    results.forEach((res, bi) => {
      const ticker = batch[bi];
      if (!res.success || !res.data || res.data.length < 60) return;

      const sectorKey = TICKER_SECTOR_MAP[ticker] ?? "OTHER";
      if (filterSectorKey && sectorKey !== filterSectorKey) return;

      const closes = extractCloses(res.data);
      const rs3m = vnCloses.length > 0 ? calculateRelativeStrength(closes, vnCloses, 63) : null;
      const volumeSpikeRatio = calculateVolumeSpikeRatio(res.data, 20);

      inputs.push({ ticker, sectorKey, sectorQuadrant: quadrantMap[sectorKey] ?? "Lagging", rs3m, volumeSpikeRatio });
    });

    if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, 150));
  }

  const top20 = rankTop20(inputs);
  return NextResponse.json({ generatedAt: new Date().toISOString(), totalAnalyzed: inputs.length, top20 });
}