import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { computeEventWindowReturns, AGM_TEMPLATE } from "@/lib/elite10/time-engine";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// Elite 10 - Vung 2.5 Time Engine, template AGM: quet lich su ngay hop
// DHCD THAT (agmEvents, VCI eventCode AGME/AGMR/EGME, field issueDate -
// da xac nhan dung trong adapter) + gia adjClose (Yahoo), tinh % loi
// nhuan 2 cua so A1/A2 cho MOI su kien lich su. Chay 1 LAN/TUAN (giong
// dividend-cycle-scan), vong xoay batch nho.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 10;

export async function GET() {
  try {
    const universeTickers = (await prisma.dividendUniverseEntry.findMany({ select: { ticker: true } })).map((e) => e.ticker);
    const allTickers = Array.from(new Set([...DIVIDEND_STOCKS.map((s) => s.ticker), ...universeTickers]));

    const existingScans = await prisma.agmCycleWindow.groupBy({ by: ["ticker"], _max: { computedAt: true } });
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

        const agmEventsWithDate = eventsResult.agmEvents.filter((e) => e.exerciseDate !== null);
        const prices = priceResult.data.map((bar) => ({ date: bar.date, adjClose: bar.adjClose }));

        for (const ev of agmEventsWithDate) {
          const wret = computeEventWindowReturns(prices, ev.exerciseDate as string, AGM_TEMPLATE);
          await prisma.agmCycleWindow.upsert({
            where: { ticker_agmDate: { ticker, agmDate: new Date(ev.exerciseDate as string) } },
            create: { ticker, agmDate: new Date(ev.exerciseDate as string), wA1: wret.A1, wA2: wret.A2 },
            update: { wA1: wret.A1, wA2: wret.A2 },
          });
          totalEventsProcessed++;
        }
        tickerResults.push({ ticker, eventsFound: agmEventsWithDate.length });
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
    console.error("[cron/elite10-agm-cycle-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét AGM Cycle Scan lúc này." }, { status: 500 });
  }
}
