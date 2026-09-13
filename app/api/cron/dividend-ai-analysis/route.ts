import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDividendAnalysisAgent } from "@/lib/ai/gemini-agents";

// P2 (Bo Loc Co Phieu - Nhom B): Cron Job MOI, chay 1 lan/ngay, xu ly
// theo VONG XOAY (batch nho, giong Cron Job 2) cho CA 17 ma theo doi
// goc VA 71 ma Universe (loai trung) - goi Gemini sinh Pros/Cons +
// Catalyst Score, CHI dua tren so lieu dinh luong da co (khong bia).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 15; // Nho hon Cron Job 2 vi goi Gemini co do tre rieng
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://tuan-quant-scanner-psi.vercel.app";

interface StockAnalysisInput {
  ticker: string;
  sector: string | null;
  pe: number | null;
  roe: number | null;
  debtEquity: number | null;
  dividendYieldPct: number | null;
  payoutRatioPct: number | null;
  profitGrowthYoY: number | null;
  fScore: number | null;
  fScoreMax: number;
  overallQualityScore: number | null;
  latestEventType: string | null;
}

export async function GET() {
  try {
    // Buoc 1: lay danh sach 88 ma (17 + 71, loai trung) tu 2 nguon khac
    // nhau - 17 ma qua route quality-score (tinh REAL-TIME, khong luu
    // DB), 71 ma Universe doc TRUC TIEP tu Database (da luu san).
    const [qualityScoreRes, universeEntries] = await Promise.all([
      fetch(`${APP_BASE_URL}/api/cotuc/quality-score`).then((r) => r.json()).catch(() => null),
      prisma.dividendUniverseEntry.findMany(),
    ]);

    const stock17Map = new Map<string, StockAnalysisInput>();
    if (qualityScoreRes?.results) {
      for (const r of qualityScoreRes.results) {
        stock17Map.set(r.ticker, {
          ticker: r.ticker, sector: r.sector,
          pe: r.details?.pe ?? null, roe: null, debtEquity: r.details?.debtEquity ?? null,
          dividendYieldPct: r.details?.dividendYieldPct ?? null,
          payoutRatioPct: r.details?.payoutRatioPct ?? null,
          profitGrowthYoY: r.details?.profitGrowthYoY ?? null,
          fScore: r.details?.fScore ?? null, fScoreMax: 6,
          overallQualityScore: (r.tier1 !== null && r.tier2 !== null && r.tier3 !== null)
            ? Math.round((r.tier1 * 30 + r.tier2 * 30 + r.tier3 * 25) / 85) : null,
          latestEventType: null,
        });
      }
    }

interface UniverseEntryForAi {
  ticker: string; sector: string | null; pe: number | null; roe: number | null;
  debtEquity: number | null; dividendYieldPct: number | null; payoutRatioPct: number | null;
  profitGrowthYoY: number | null; fScore: number | null; overallScoreTier123: number | null;
  latestEventType: string | null;
}

const universeMap = new Map<string, StockAnalysisInput>(
  (universeEntries as UniverseEntryForAi[]).map((e) => [e.ticker, {
    ticker: e.ticker, sector: e.sector,
    pe: e.pe, roe: e.roe, debtEquity: e.debtEquity,
    dividendYieldPct: e.dividendYieldPct, payoutRatioPct: e.payoutRatioPct,
    profitGrowthYoY: e.profitGrowthYoY, fScore: e.fScore, fScoreMax: 6,
    overallQualityScore: e.overallScoreTier123 !== null ? Math.round(e.overallScoreTier123) : null,
    latestEventType: e.latestEventType,
  }])
);

    // Gop 2 nguon, uu tien du lieu 17 ma neu trung (day du hon)
    const allStockData = new Map<string, StockAnalysisInput>([...universeMap, ...stock17Map]);

    // Buoc 2: lay BATCH theo vong xoay (uu tien ma CHUA TUNG co ket qua
    // AI, roi toi ma CU NHAT)
    interface AiAnalysisRecord { ticker: string; generatedAt: Date; }
    const existingAnalysis: AiAnalysisRecord[] = await prisma.dividendAiAnalysis.findMany({
      orderBy: { generatedAt: "asc" },
    });
    const existingMap = new Map(existingAnalysis.map((a: AiAnalysisRecord) => [a.ticker, a]));

    const allTickers = Array.from(allStockData.keys());
    const sortedTickers = allTickers.sort((a, b) => {
      const aTime = existingMap.get(a)?.generatedAt.getTime() ?? 0; // 0 = chua tung co, uu tien truoc
      const bTime = existingMap.get(b)?.generatedAt.getTime() ?? 0;
      return aTime - bTime;
    });
    const batch = sortedTickers.slice(0, BATCH_SIZE);

    // Buoc 3: goi Gemini SONG SONG cho batch, luu ket qua
    const results = await Promise.allSettled(
      batch.map(async (ticker) => {
        const data = allStockData.get(ticker);
        if (!data) return { ticker, skipped: true };

        const analysis = await runDividendAnalysisAgent(data as unknown as Record<string, unknown>);
        await prisma.dividendAiAnalysis.upsert({
          where: { ticker },
          create: { ticker, pros: analysis.pros ?? [], cons: analysis.cons ?? [], catalystScore: analysis.catalystScore ?? null },
          update: { pros: analysis.pros ?? [], cons: analysis.cons ?? [], catalystScore: analysis.catalystScore ?? null },
        });
        return { ticker, success: true };
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected");

    return NextResponse.json({
      processedAt: new Date().toISOString(),
      totalStocks: allTickers.length,
      batchSize: batch.length,
      succeeded,
      failedCount: failed.length,
      batch,
    });
  } catch (err) {
    console.error("[cron/dividend-ai-analysis] Lỗi:", err);
    return NextResponse.json({ error: "Không thể chạy AI analysis lúc này." }, { status: 500 });
  }
}
