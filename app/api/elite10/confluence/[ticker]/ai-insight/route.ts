import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildConfluenceProfile } from "@/lib/elite10/confluence-adapter";
import { computeConfluenceScore, type MarketRegime } from "@/lib/elite10/confluence-scoring";
import { riskFlagsFor } from "@/lib/elite10/trap-detector";
import { runAiPipeline } from "@/lib/elite10/ai-pipeline";
import { buildWindowStats, DIVIDEND_TEMPLATE, findCurrentWindow } from "@/lib/elite10/time-engine";

// Elite 10 - Vung 4-5 "AI Deep Insight": Bull/Bear case + Trade Scenario
// (dung WindowStat THAT tu Time Engine, khong dung cong thuc suy dien
// nhu ban goc) + Validation Layer chong hallucination.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();
    const { searchParams } = new URL(req.url);
    const regime = (searchParams.get("regime") ?? "trending") as MarketRegime;

    const [profile, divRows, stockItem] = await Promise.all([
      buildConfluenceProfile(ticker),
      prisma.dividendCycleWindow.findMany({ where: { ticker } }),
      prisma.sieuQuetStockItem.findUnique({ where: { ticker } }),
    ]);

    const result = computeConfluenceScore(profile, regime);
    const flags = riskFlagsFor(profile);

    const divWindowRows = divRows.map((r) => ({ W1: r.wM1, W2: r.wPreAgm, W3: r.wPreEx, W4: r.wPostEx, W5: r.wPostCredit }));
    const dividendWindows = buildWindowStats(divWindowRows, DIVIDEND_TEMPLATE);
    // Uoc luong so ngay toi su kien tiep theo tu su kien gan nhat + chu ky
    // trung binh (khong the xac dinh chinh xac neu chua co lich cong bo
    // moi) - de don gian, dung W3 (truoc GDKHQ) lam "cua so hien tai" mac
    // dinh khi khong xac dinh duoc ngay cu the.
    const currentWindow = dividendWindows.find((w) => w.windowId === "W3") ?? null;

    const refPrice = stockItem?.price ?? 30000;
    const verdict = runAiPipeline(profile, result.score, result.ci, result.star, 0, flags, refPrice, currentWindow, result.nAvailable);

    return NextResponse.json(verdict);
  } catch (err) {
    console.error("[api/elite10/confluence/ai-insight] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính AI Insight lúc này." }, { status: 500 });
  }
}
