import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import {
  DIVIDEND_TEMPLATE, AGM_TEMPLATE, EARNINGS_TEMPLATE,
  buildWindowStats, computeSeasonalStats, timeConfluenceVerdict,
} from "@/lib/elite10/time-engine";

// Elite 10 - Vung 2.5 Time Engine: tong hop Dividend + AGM + Seasonal
// (that) + placeholder minh bach cho Earnings/Wyckoff (chua co nguon),
// tra ve Timing Verdict day du cho 1 ma.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Thiếu tham số ticker." }, { status: 400 });

    const [divRows, agmRows, priceResult] = await Promise.all([
      prisma.dividendCycleWindow.findMany({ where: { ticker } }),
      prisma.agmCycleWindow.findMany({ where: { ticker } }),
      fetchOhlcvHistory(ticker, "5y"),
    ]);

    const divWindowRows = divRows.map((r) => ({ W1: r.wM1, W2: r.wPreAgm, W3: r.wPreEx, W4: r.wPostEx, W5: r.wPostCredit }));
    const dividendWindows = buildWindowStats(divWindowRows, DIVIDEND_TEMPLATE);

    const agmWindowRows = agmRows.map((r) => ({ A1: r.wA1, A2: r.wA2 }));
    const agmWindows = buildWindowStats(agmWindowRows, AGM_TEMPLATE);

    let seasonalStats: ReturnType<typeof computeSeasonalStats> = [];
    if (priceResult.success && priceResult.data) {
      seasonalStats = computeSeasonalStats(priceResult.data.map((b) => ({ date: b.date, adjClose: b.adjClose })));
    }
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthSeasonal = seasonalStats.find((s) => s.month === currentMonth) ?? null;

    // Ngay GDKHQ tiep theo: uu tien du kien tu su kien GAN NHAT da quet
    // (khong the du doan chinh xac ngay tiep theo neu chua co lich cong
    // bo moi - de null neu khong xac dinh duoc, KHONG uoc luong bua).
    const mostRecentDiv = divRows.length > 0 ? divRows.sort((a, b) => b.exDate.getTime() - a.exDate.getTime())[0] : null;
    const daysToNextDividend = null; // Can lich cong bo THAT cho dot tiep theo - chua co nguon du doan tin cay
    const nextDividendDate = null;

    const verdict = timeConfluenceVerdict(ticker, dividendWindows, daysToNextDividend, nextDividendDate, currentMonthSeasonal);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ticker,
      dividend: { totalEvents: divRows.length, windows: dividendWindows },
      agm: { totalEvents: agmRows.length, windows: agmWindows },
      seasonal: { currentMonth, stats: seasonalStats },
      earnings: { integrated: false, template: EARNINGS_TEMPLATE, note: "Chưa có nguồn ngày công bố BCTC thật (VCI chỉ có kỳ báo cáo, không có ngày thị trường phản ứng). Sẽ bổ sung khi tìm được nguồn." },
      wyckoff: { integrated: false, note: "Chưa có model phát hiện pha Wyckoff bằng dữ liệu thật — không đưa vào verdict để tránh dùng số liệu giả." },
      verdict,
      lastKnownDividendEvent: mostRecentDiv ? mostRecentDiv.exDate.toISOString().slice(0, 10) : null,
    });
  } catch (err) {
    console.error("[api/elite10/cycle] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Timing Verdict lúc này." }, { status: 500 });
  }
}
