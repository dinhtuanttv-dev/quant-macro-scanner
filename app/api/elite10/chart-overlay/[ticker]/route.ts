import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildConfluenceProfile } from "@/lib/elite10/confluence-adapter";
import { computeConfluenceScore } from "@/lib/elite10/confluence-scoring";
import { riskFlagsFor } from "@/lib/elite10/trap-detector";
import { runAiPipeline } from "@/lib/elite10/ai-pipeline";
import { buildWindowStats, DIVIDEND_TEMPLATE, AGM_TEMPLATE, findCurrentWindow } from "@/lib/elite10/time-engine";

// Elite 10 - TICH HOP Time Engine + Confluence Engine LEN CHART GIA (yeu
// cau nguoi dung 2026-09-17): tra ve 4 nhom du lieu de MainChart.tsx ve
// truc tiep len bieu do, thay vi chi hien thi rieng biet o cac panel:
//   1. events: markers ngay GDKHQ/DHCD THAT (tu DividendCycleWindow/
//      AgmCycleWindow), KHONG PHAI mock nhu truoc
//   2. tradeScenario: Buy Zone/Stop Loss/Take Profit (Price Lines)
//   3. currentWindow: cua so dang active + so ngay con lai (ribbon)
//   4. riskFlags: canh bao (marker tai nen hien tai)
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();
    const { searchParams } = new URL(req.url);
    const regime = (searchParams.get("regime") ?? "trending") as any;

    const [profile, divRows, agmRows, stockItem] = await Promise.all([
      buildConfluenceProfile(ticker),
      prisma.dividendCycleWindow.findMany({ where: { ticker }, orderBy: { exDate: "desc" } }),
      prisma.agmCycleWindow.findMany({ where: { ticker }, orderBy: { agmDate: "desc" } }),
      prisma.sieuQuetStockItem.findUnique({ where: { ticker } }),
    ]);

    // 1. Events THAT (markers) - moi su kien lich su la 1 diem tren chart
    const events = [
      ...divRows.map((r) => ({ time: r.exDate.toISOString().slice(0, 10), type: "C" as const, label: "GDKHQ" })),
      ...agmRows.map((r) => ({ time: r.agmDate.toISOString().slice(0, 10), type: "A" as const, label: "ĐHCĐ" })),
    ];

    // 2+3. Trade Scenario + Current Window
    const result = computeConfluenceScore(profile, regime);
    const flags = riskFlagsFor(profile);
    const divWindowRows = divRows.map((r) => ({ W1: r.wM1, W2: r.wPreAgm, W3: r.wPreEx, W4: r.wPostEx, W5: r.wPostCredit }));
    const dividendWindows = buildWindowStats(divWindowRows, DIVIDEND_TEMPLATE);

    // FIX (rà soát 2026-09-17): TRUOC DAY hardcode "W3" lam mac dinh -
    // KHONG PHAN ANH DUNG thuc te. GIO tinh THAT: uoc tinh ngay su kien
    // tiep theo = exDate GAN NHAT + CHU KY TRUNG BINH lich su (khoang
    // cach trung binh giua cac exDate lien tiep), roi dung findCurrentWindow
    // (da co san trong time-engine.ts) de xac dinh DUNG cua so dang active.
    let currentWindow = null as ReturnType<typeof buildWindowStats>[number] | null;
    if (divRows.length >= 2) {
      const sortedExDates = divRows.map((r) => r.exDate.getTime()).sort((a, b) => a - b);
      const gaps: number[] = [];
      for (let i = 1; i < sortedExDates.length; i++) gaps.push((sortedExDates[i] - sortedExDates[i - 1]) / (1000 * 60 * 60 * 24));
      const avgCycleDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const mostRecentExDate = new Date(sortedExDates[sortedExDates.length - 1]);
      const estimatedNextEventDate = new Date(mostRecentExDate);
      estimatedNextEventDate.setDate(estimatedNextEventDate.getDate() + Math.round(avgCycleDays));
      const daysToNextEvent = Math.round((estimatedNextEventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      currentWindow = findCurrentWindow(daysToNextEvent, DIVIDEND_TEMPLATE, dividendWindows);
    } else if (divRows.length === 1) {
      // Chi 1 su kien lich su - khong du de tinh chu ky, dung truc tiep
      // ngay GDKHQ da co (co the da qua, van huu ich de xem cua so gan nhat).
      const daysToEvent = Math.round((divRows[0].exDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      currentWindow = findCurrentWindow(daysToEvent, DIVIDEND_TEMPLATE, dividendWindows);
    }

    const refPrice = stockItem?.price ?? 30000;
    const verdict = runAiPipeline(profile, result.score, result.ci, result.star, 0, flags, refPrice, currentWindow, result.nAvailable);

    return NextResponse.json({
      ticker,
      events,
      tradeScenario: verdict.tradeScenario,
      currentWindow: currentWindow ? {
        windowId: currentWindow.windowId, label: currentWindow.label,
        avgReturn: currentWindow.avgReturn, winRate: currentWindow.winRate,
        sampleSize: currentWindow.sampleSize, isLowSample: currentWindow.isLowSample,
        // MINH BACH: ngay su kien tiep theo la UOC TINH tu chu ky trung
        // binh lich su, KHONG PHAI lich cong bo chinh thuc (chua co nguon).
        isEstimatedNextEventDate: true,
      } : null,
      riskFlags: flags,
      score: result.score, starRating: result.star,
    });
  } catch (err) {
    console.error("[api/elite10/chart-overlay] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu overlay lúc này." }, { status: 500 });
  }
}
