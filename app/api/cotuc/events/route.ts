import { NextResponse } from "next/server";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// FIX P0 (2026-09-12): 10s qua thap cho 17 request song song toi VCI.
export const maxDuration = 30;
// FIX QUAN TRONG: Next.js App Router MAC DINH co the coi GET route la
// "static" va CACHE ket qua (khong chay lai code moi) neu thieu khai bao
// nay - da xac nhan qua trieu chung THAT: code nguon dung nhung response
// van tra ve cau truc CU/loi. Bat buoc dynamic de LUON chay lai.
export const dynamic = "force-dynamic";

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const results = await fetchDividendEventsBatch(tickers);
    const successCount = results.filter((r) => r.available).length;

    // P1: them field MOI "lifecycleEvents" (5 moc thuc te da chuan hoa +
    // phan loai CASH/STOCK_DIVIDEND/BONUS_ISSUE/ESOP) - CHI THEM, khong
    // xoa cac field cu (exDividendEvents/agmEvents) de khong pha vo
    // useDividendEvents.ts dang dung. Bo "rawEvents" khoi response cuoi
    // (chi dung noi bo de build lifecycleEvents) - tranh payload thua.
    const resultsWithLifecycle = results.map((r) => {
      const { rawEvents, ...rest } = r;
      return {
        ...rest,
        lifecycleEvents: r.available ? buildLifecycleEvents(r.ticker, rawEvents) : [],
      };
    });

    // DEBUG TAM THOI: dua thang vao response JSON (thay vi console.log,
    // vi kho tim dung cho xem Runtime Logs tren Vercel UI) - CHAC CHAN se
    // thay duoc ngay trong Invoke-WebRequest, khong phu thuoc dashboard.
    const debugInfo = {
      bmpTopLevelKeys: Object.keys(resultsWithLifecycle[0]),
      bmpAgmEventsLength: resultsWithLifecycle[0].agmEvents.length,
      bmpLifecycleEventsLength: resultsWithLifecycle[0].lifecycleEvents.length,
      bmpAgmEventsRaw: resultsWithLifecycle[0].agmEvents,
      bmpLifecycleEventsRaw: resultsWithLifecycle[0].lifecycleEvents,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      // DEBUG MARKER (tam thoi, se xoa sau khi xac nhan deploy dung):
      // dung de XAC NHAN CHAC CHAN Vercel dang chay DUNG code moi nhat,
      // khong phai build cache cu.
      codeVersionMarker: "P1-lifecycle-fix-v3",
      debugInfo,
      totalRequested: tickers.length,
      successCount,
      results: resultsWithLifecycle,
    });
  } catch (err) {
    console.error("[api/cotuc/events] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải sự kiện GDKHQ/ĐHCĐ lúc này." }, { status: 500 });
  }
}
