import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import {
  extractCloses, calculateRelativeStrength, calculateVolumeSpikeRatio,
  calculatePVTTrendScore, calculateADTrendScore,
} from "@/lib/market-data/technical-indicators";
import { stockUniverse } from "@/lib/quant-data";
import { rankTop20, type ConfluenceInput } from "@/lib/sector-filter/scoring/confluence-score";
import { computeRRGPoints } from "@/lib/sector-filter/rrg/compute-rrg";
import { calculateRiskOnIndex } from "@/lib/scoring/weighted-macro-score";
import { createServiceClient } from "@/lib/supabase/client";
import type { RRGQuadrant } from "@/lib/sector-filter/rrg/rrg-calculator";

// FIX RELIABILITY (2026-09-11): 10s qua thap - route nay xu ly 61+ ma qua
// Yahoo Finance, truoc day CON tu goi HTTP sang route /rrg (da loai bo,
// xem lib/sector-filter/rrg/compute-rrg.ts). Tang len 60s giong cac route
// xu ly nang khac trong du an.
export const maxDuration = 60;
const BATCH_SIZE = 18;

const TICKER_SECTOR_MAP: Record<string, string> = {};
stockUniverse.forEach((s: any) => { TICKER_SECTOR_MAP[s.ticker] = s.sector; });

async function fetchRiskOnScore(): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("world_macro_trends").select("dxy, vix, treasury_10y")
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (!data || data.dxy == null || data.vix == null || data.treasury_10y == null) {
      console.warn("[top20] Khong lay duoc du lieu vi mo moi nhat de tinh Risk-On Index - dung trong so trung lap (score=50).");
      return 50;
    }
    return calculateRiskOnIndex({ dxy: data.dxy, vix: data.vix, treasury10y: data.treasury_10y }).score;
  } catch (err) {
    console.error("[top20] Loi lay Risk-On Index, dung trong so trung lap (score=50):", err);
    return 50;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filterSectorKey = searchParams.get("sectorKey");

  // FIX: goi TRUC TIEP ham JS, khong qua HTTP self-fetch nua. Chay SONG
  // SONG voi Risk-On Index va VN-Index (khong lam nhau cham lai).
  const [rrgResult, riskOnScore, vnResult] = await Promise.all([
    computeRRGPoints(),
    fetchRiskOnScore(),
    fetchOhlcvHistory("^VNINDEX.VN", "6mo"),
  ]);

  const quadrantMap: Record<string, RRGQuadrant> = {};
  rrgResult?.points.forEach((p) => { quadrantMap[p.sectorKey] = p.quadrant; });

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
      // MOI: PVT + A/D tinh tu chinh du lieu OHLCV da fetch san - khong
      // ton them 1 lan goi mang nao ca.
      const pvtScore = calculatePVTTrendScore(res.data, 20);
      const adScore = calculateADTrendScore(res.data, 20);

      inputs.push({
        ticker, sectorKey, sectorQuadrant: quadrantMap[sectorKey] ?? "Lagging",
        rs3m, volumeSpikeRatio, pvtScore, adScore,
      });
    });

    if (i + BATCH_SIZE < tickers.length) await new Promise((r) => setTimeout(r, 150));
  }

  const top20 = rankTop20(inputs, riskOnScore);
  return NextResponse.json({
    generatedAt: new Date().toISOString(), totalAnalyzed: inputs.length,
    riskOnScore, top20,
  });
}
