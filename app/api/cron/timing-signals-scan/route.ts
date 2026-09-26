import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { buildCycleContext, buildCycleStatsV3, fetchBenchmarkPricesOnce } from "@/lib/cotuc/timing-v3/compute-cycle-io";
import { tradingDaysBetween, WEEKEND_ONLY_CALENDAR } from "@/lib/cotuc/timing-v3/date-utils";

// Tich hop Sprint 4-5 - GIAI PHAP BEN VUNG (thay the tinh real-time
// trong route /api/cotuc/timing-signals, da bi FUNCTION_INVOCATION_
// TIMEOUT that su tren Vercel Hobby plan du da giam so ma va tang
// maxDuration): CRON dinh ky tinh TimingSignal cho tung ma trong
// DIVIDEND_STOCKS (17-18 ma), LUU vao bang TimingSignalCache. Route
// /api/cotuc/timing-signals se CHI DOC LAI bang nay (nhanh, khong
// bao gio timeout) - giong dung pattern sector-top20-scan da lam cho
// Elite 10.
//
// maxDuration=300 (toi da Hobby plan theo tai lieu Vercel) - cron
// chay NGAM dinh ky (khong nguoi dung nao cho truc tiep), nen du co
// cham hon route API van chap nhan duoc.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 8;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// FIX TIMEOUT LAN 3 (2026-09-26, xac nhan qua kiem tra thuc te): du da
// giam xuong 17-18 ma VA tang maxDuration len 300, CRON VAN
// FUNCTION_INVOCATION_TIMEOUT - xac nhan gioi han THAT cua tai khoan
// nay THAP HON NHIEU so voi tai lieu Vercel (co the do region "hkg1"
// hoac cau hinh rieng). GIAI PHAP CHAC CHAN: cho phep goi CRON NHIEU
// LAN, moi lan CHI xu ly 1 phan nho (query param offset/limit) - goi
// lai (VD) 6 lan x 3 ma thay vi 1 lan x 18 ma. Khong truyen gi ->
// mac dinh xu ly ca danh sach (giu tuong thich nguoc voi Vercel Cron
// tu dong, se can cau hinh lai schedule goi nhieu lan neu dung cach
// nay lau dai).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const offset = Number(searchParams.get("offset") ?? "0");
    const limit = Number(searchParams.get("limit") ?? "999");

    const benchmarkPrices = await fetchBenchmarkPricesOnce();
    if ("reason" in benchmarkPrices) {
      return NextResponse.json({ error: "Không tải được giá VN-Index.", detail: benchmarkPrices.detail }, { status: 500 });
    }

    const allTickers = DIVIDEND_STOCKS.map((s) => s.ticker);
    const tickers = allTickers.slice(offset, offset + limit);
    const today = new Date().toISOString().slice(0, 10);
    let savedCount = 0;
    let skippedCount = 0;

    for (const batch of chunk(tickers, BATCH_SIZE)) {
      const results = await Promise.all(
        batch.map(async (ticker) => {
          const ctx = await buildCycleContext(ticker, benchmarkPrices);
          if ("reason" in ctx) return null;

          const stats = buildCycleStatsV3(ctx);
          const selected = stats.selectedWindowId !== null
            ? stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected)
            : undefined;

          const latestExDate = ctx.eventExDates[0] ?? null;
          const tdToEx = latestExDate ? tradingDaysBetween(today, latestExDate, WEEKEND_ONLY_CALENDAR) : null;
          const k = tdToEx === null ? null : -tdToEx;

          let action = "NO_DATE";
          if (tdToEx === null) action = "NO_DATE";
          else if (tdToEx < 0) action = "POST_EX";
          else if (!selected) action = "NO_SIGNAL";
          else if (k! < selected.entryFrom) action = "TOO_EARLY";
          else if (k! <= selected.entryTo) action = "IN_WINDOW";
          else action = "WINDOW_PASSED";

          let confidence: string | null = null;
          if (selected) {
            confidence = selected.nEvents >= 12 && (selected.oosMeanNet ?? -1) > 0 ? "HIGH" : selected.nEvents >= 8 ? "MEDIUM" : "LOW";
          }

          return {
            ticker, action, tdToEx,
            windowEntryFrom: selected?.entryFrom ?? null,
            windowEntryTo: selected?.entryTo ?? null,
            windowExitOffset: selected?.exitOffset ?? null,
            expectedNetReturn: selected?.netExpectancyLcb ?? null,
            nEvents: selected?.nEvents ?? null,
            fdrQValue: selected?.fdrQValue ?? null,
            confidence,
          };
        }),
      );

      for (const r of results) {
        if (!r) { skippedCount++; continue; }
        await prisma.timingSignalCache.upsert({
          where: { ticker: r.ticker },
          create: r,
          update: r,
        });
        savedCount++;
      }
    }

    return NextResponse.json({ savedCount, skippedCount, processedInThisCall: tickers.length, offset, limit, totalTickers: allTickers.length });
  } catch (err) {
    console.error("[api/cron/timing-signals-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không quét được Timing Signals." }, { status: 500 });
  }
}
