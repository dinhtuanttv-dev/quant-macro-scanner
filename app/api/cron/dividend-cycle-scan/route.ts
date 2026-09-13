import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { computeWindowReturns } from "@/lib/cotuc/dividend-cycle-engine";

// Timing Engine (P3) - Cron Job quet LICH SU SU KIEN CO TUC (5 nam,
// da co san tu fetchDividendEventsBatch) + gia da dieu chinh (Yahoo
// adjClose) cho TUNG MA, tinh % loi nhuan 5 cua so chuan CHO MOI su
// kien lich su, luu vao Database. Chay 1 LAN/TUAN (lich su it thay doi
// hon Score/F-Score hang ngay). VONG XOAY batch nho (giong Cron Job
// Score/AI) - voi 88 ma, se mat vai tuan de phu het 1 vong dau tien.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;

export async function GET() {
  try {
    // Buoc 1: lay danh sach 88 ma (17 + 71 Universe, loai trung) - dung
    // lai danh sach ticker tu Database (DividendUniverseEntry) + 17 ma
    // theo doi goc.
    const { DIVIDEND_STOCKS } = await import("@/lib/quant-cotuc");
    const universeEntries = await prisma.dividendUniverseEntry.findMany({ select: { ticker: true } });
    const universeTickers = universeEntries.map((e) => e.ticker);
    const allTickers = Array.from(new Set([...DIVIDEND_STOCKS.map((s) => s.ticker), ...universeTickers]));

    // Buoc 2: vong xoay - uu tien ma CHUA TUNG duoc quet (khong co dong
    // nao trong DividendCycleWindow), roi toi ma quet LAU NHAT.
    const existingScans = await prisma.dividendCycleWindow.groupBy({
      by: ["ticker"],
      _max: { computedAt: true },
    });
    const lastScanMap = new Map(existingScans.map((s) => [s.ticker, s._max.computedAt?.getTime() ?? 0]));
    const sortedTickers = [...allTickers].sort((a, b) => (lastScanMap.get(a) ?? 0) - (lastScanMap.get(b) ?? 0));
    const batch = sortedTickers.slice(0, BATCH_SIZE);

    let totalEventsProcessed = 0;
    const tickerResults: { ticker: string; eventsFound: number; error?: string }[] = [];

    for (const ticker of batch) {
      try {
        const [eventsResults, priceResult] = await Promise.all([
          fetchDividendEventsBatch([ticker]),
          fetchOhlcvHistory(ticker, "5y"),
        ]);

        const eventsResult = eventsResults[0];
        if (!eventsResult.available || !priceResult.success || !priceResult.data) {
          tickerResults.push({ ticker, eventsFound: 0, error: !eventsResult.available ? "Khong lay duoc su kien" : "Khong lay duoc gia" });
          continue;
        }

        const lifecycle = buildLifecycleEvents(ticker, eventsResult.rawEvents);
        const relevantEvents = lifecycle.filter((e) => e.exrightDate !== null);
        const prices = priceResult.data.map((bar) => ({ date: bar.date, adjClose: bar.adjClose }));

        for (const event of relevantEvents) {
          const wret = computeWindowReturns(prices, event.exrightDate as string);
          await prisma.dividendCycleWindow.upsert({
            where: { ticker_exDate: { ticker, exDate: new Date(event.exrightDate as string) } },
            create: {
              ticker, exDate: new Date(event.exrightDate as string), divType: event.eventType,
              wM1: wret.w_m1, wPreAgm: wret.w_pre_agm, wPreEx: wret.w_pre_ex,
              wPostEx: wret.w_post_ex, wPostCredit: wret.w_post_credit,
            },
            update: {
              divType: event.eventType,
              wM1: wret.w_m1, wPreAgm: wret.w_pre_agm, wPreEx: wret.w_pre_ex,
              wPostEx: wret.w_post_ex, wPostCredit: wret.w_post_credit,
            },
          });
          totalEventsProcessed++;
        }
        tickerResults.push({ ticker, eventsFound: relevantEvents.length });
      } catch (err) {
        tickerResults.push({ ticker, eventsFound: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      totalTickers: allTickers.length,
      batchSize: batch.length,
      totalEventsProcessed,
      tickerResults,
    });
  } catch (err) {
    console.error("[cron/dividend-cycle-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét Timing Engine lúc này." }, { status: 500 });
  }
}
