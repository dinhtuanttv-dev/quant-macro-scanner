import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses, calculateSMA, classifyMa50Status, calculateRelativeStrength, calculateVolumeSpikeRatio, computeScoredStock } from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";

// ============================================================
// SCORED STOCKS API ROUTE
// Scoring Algorithm: 30% Pattern + 20% Volume + 20% RS + 30% Momentum
// Confluence Check: chi chap nhan khi >= 2 dieu kien dong thuan
// Stress Test: gioi han toi da 4 ma / nganh de dam bao da dang
// Vercel Hobby: maxDuration=10s, goi song song theo batch
// ============================================================

export const maxDuration = 10;

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 200;
const MAX_PER_SECTOR = 4; // Stress Test: toi da 4 ma / nganh
const MIN_CONFLUENCE = 2; // Confluence Check: can >= 2 dieu kien

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topN = Math.min(Number(searchParams.get("top") ?? "20"), 30);

  try {
    // Lay VN-Index lam benchmark cho RS
    const vnResult = await fetchOhlcvHistory("^VNINDEX.VN", "6mo");
    const vnCloses = vnResult.success && vnResult.data ? extractCloses(vnResult.data) : [];

    // Goi OHLCV song song theo batch cho toan bo universe
    const tickers = stockUniverse.map((s) => s.ticker);
    const ohlcvMap: Record<string, ReturnType<typeof extractCloses>> = {};
    const barMap: Record<string, Awaited<ReturnType<typeof fetchOhlcvHistory>>["data"]> = {};

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((t) => fetchOhlcvHistory(t, "6mo")));
      results.forEach((res, bi) => {
        const ticker = batch[bi];
        if (res.success && res.data && res.data.length >= 30) {
          ohlcvMap[ticker] = extractCloses(res.data);
          barMap[ticker] = res.data;
        }
      });
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Tinh ScoredStock cho moi ma co du lieu
    const scored = stockUniverse
      .map((stock) => {
        const closes = ohlcvMap[stock.ticker];
        const bars = barMap[stock.ticker];
        if (!closes || !bars) return null;

        const rs3m = calculateRelativeStrength(closes, vnCloses, 60);
        const ma50Status = classifyMa50Status(closes);
        const volSpike = calculateVolumeSpikeRatio(bars, 20);
        const ma50Value = calculateSMA(closes, 50);
        const latestClose = closes[closes.length - 1];

        return computeScoredStock(
          stock.ticker, stock.sector,
          rs3m, ma50Status, volSpike, ma50Value, latestClose,
          closes, stock.faScore
        );
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Confluence Check: loai bo ma chi co 0-1 dieu kien dong thuan
    const confluenceFiltered = scored.filter((s) => s.scores.confluence >= MIN_CONFLUENCE);

    // Sort theo total score giam dan
    const sorted = confluenceFiltered.sort((a, b) => b.scores.total - a.scores.total);

    // Stress Test: gioi han toi da MAX_PER_SECTOR ma / nganh
    const sectorCount: Record<string, number> = {};
    const diversified = sorted.filter((s) => {
      const count = sectorCount[s.sector] ?? 0;
      if (count >= MAX_PER_SECTOR) return false;
      sectorCount[s.sector] = count + 1;
      return true;
    });

    const top20 = diversified.slice(0, topN);

    // Phan loai sub-tab
    const goldenFilter = top20.filter((s) =>
      s.ma50Status === "safe" && (s.rs3m ?? 0) > 0 && s.scores.confluence >= 3
    );

    const bearTrap = sorted.filter((s) =>
      s.ma50Status === "broken" || (s.rs3m !== null && s.rs3m < -5)
    ).slice(0, 6);

    const foreignAccum = top20.filter((s) =>
      (s.rs3m ?? 0) > 3 && (s.volumeSpikeRatio ?? 0) > 1.3 && s.ma50Status !== "broken"
    ).sort((a, b) => (b.rs3m ?? 0) - (a.rs3m ?? 0));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalAnalyzed: scored.length,
      afterConfluenceFilter: confluenceFiltered.length,
      top20,
      goldenFilter,
      bearTrap,
      foreignAccum,
      sectorDistribution: sectorCount,
    });

  } catch (err) {
    console.error("[api/scored-stocks] Loi:", err);
    return NextResponse.json({ error: "Khong the tinh scored stocks" }, { status: 500 });
  }
}