import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";

// Nen tang Outcome-Tracking (Tech Spec v2) - cron HANG NGAY: quet cac
// ban ghi InsightOutcome status='pending' DA DEN HAN (predictedAt +
// horizonDays <= now), fetch gia that gan nhat, TU DONG cham dung/sai.
//
// QUY TAC dung/sai (minh bach, don gian nhat co the o giai doan nen
// tang nay - co the tinh chinh sau khi co du lieu that):
//   starRating >= 4 (tin hieu TICH CUC) VA gia TANG -> dung
//   starRating <= 2 (tin hieu TIEU CUC) VA gia GIAM -> dung
//   starRating == 3 (trung tinh) -> KHONG cham dung/sai (wasCorrect=null)
//   Con lai -> sai
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function judgeCorrectness(starRating: number, actualReturnPct: number): boolean | null {
  if (starRating === 3) return null; // trung tinh, khong danh gia
  if (starRating >= 4) return actualReturnPct > 0;
  return actualReturnPct < 0; // starRating <= 2
}

export async function GET() {
  try {
    const now = new Date();
    const duePending = await prisma.insightOutcome.findMany({
      where: { status: "pending" },
    });

    // Loc nhung ban ghi DA DEN HAN (predictedAt + horizonDays <= now) -
    // lam o code TS thay vi raw SQL de tranh phu thuoc cu phap DB cu the.
    const due = duePending.filter((row) => {
      const dueDate = new Date(row.predictedAt);
      dueDate.setDate(dueDate.getDate() + row.horizonDays);
      return dueDate <= now;
    });

    let resolvedCount = 0, noPriceCount = 0;

    for (const row of due) {
      const result = await fetchOhlcvHistory(row.ticker, "5d");
      const bars = result.success ? result.data : null;
      if (!bars || bars.length === 0) {
        await prisma.insightOutcome.update({ where: { id: row.id }, data: { status: "no_price_data" } });
        noPriceCount++;
        continue;
      }
      const priceAtResolve = bars[bars.length - 1].adjClose;
      const actualReturnPct = ((priceAtResolve - row.priceAtPrediction) / row.priceAtPrediction) * 100;
      const wasCorrect = judgeCorrectness(row.starRating, actualReturnPct);

      await prisma.insightOutcome.update({
        where: { id: row.id },
        data: { status: "resolved", resolvedAt: now, priceAtResolve, actualReturnPct, wasCorrect },
      });
      resolvedCount++;
    }

    return NextResponse.json({
      checkedPending: duePending.length, dueForResolution: due.length,
      resolvedCount, noPriceCount,
    });
  } catch (err) {
    console.error("[cron/resolve-insight-outcomes] Lỗi:", err);
    return NextResponse.json({ error: "Không thể chạy cron chấm điểm lúc này." }, { status: 500 });
  }
}
