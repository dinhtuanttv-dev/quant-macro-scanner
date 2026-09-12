import { NextResponse } from "next/server";
import { fetchVN30VN100Universe } from "@/lib/market-data/vci-listing-adapter";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { stockUniverse } from "@/lib/quant-data";
import { prisma } from "@/lib/prisma";

// P2 (Bo Loc toan thi truong) - JOB 1/2: quet SU KIEN (nhe, khong goi
// Yahoo/BCTC) cho 100 ma VN30+VN100, LOC SO BO chi giu ma CON THOI SU
// (su kien trong khoang -180 den +180 ngay) - dung LAM DAU VAO cho Job 2
// (tinh Quality Score day du, chi cho nhom da loc, giam tai dang ke).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const sectorMap = new Map(stockUniverse.map((s) => [s.ticker, s.sector]));
const RELEVANCE_WINDOW_DAYS = 180;

export async function GET() {
  try {
    const universeResult = await fetchVN30VN100Universe();
    const tickers = universeResult.success && universeResult.data
      ? universeResult.data
      : stockUniverse.map((s) => s.ticker);

    const eventsResults = await fetchDividendEventsBatch(tickers);

    const now = Date.now();
    const windowMs = RELEVANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const relevantEntries: { ticker: string; sector: string; latestEvent: ReturnType<typeof buildLifecycleEvents>[number] }[] = [];

    for (const r of eventsResults) {
      if (!r.available) continue;
      const lifecycle = buildLifecycleEvents(r.ticker, r.rawEvents);
      if (lifecycle.length === 0) continue;

      // lifecycle da duoc sap xep dung uu tien (dividend-lifecycle.ts
      // khong tu sort - can sort lai o day theo dung logic da dung cho
      // 17 ma: uu tien exrightDate SAP TOI GAN NHAT, neu khong co thi
      // DA QUA GAN DAY NHAT).
      const withDate = lifecycle.filter((e) => e.exrightDate !== null);
      if (withDate.length === 0) continue;

      const sorted = [...withDate].sort((a, b) => {
        const ta = new Date(a.exrightDate as string).getTime();
        const tb = new Date(b.exrightDate as string).getTime();
        const da = Math.abs(ta - now), db = Math.abs(tb - now);
        // Uu tien SAP TOI (ta >= now) truoc DA QUA, roi theo do gan voi hom nay
        const aFuture = ta >= now, bFuture = tb >= now;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        return da - db;
      });

      const latestEvent = sorted[0];
      const eventTime = new Date(latestEvent.exrightDate as string).getTime();
      if (Math.abs(eventTime - now) > windowMs) continue; // qua cu, ngoai pham vi quan tam

      relevantEntries.push({ ticker: r.ticker, sector: sectorMap.get(r.ticker) ?? "Khac", latestEvent });
    }

    // Luu ket qua LOC SO BO vao DB (upsert). Job 2 se doc danh sach nay
    // de tinh Quality Score day du CHI cho nhom da loc.
    for (const entry of relevantEntries) {
      const e = entry.latestEvent;
      await prisma.dividendUniverseEntry.upsert({
        where: { ticker: entry.ticker },
        create: {
          ticker: entry.ticker,
          sector: entry.sector,
          latestEventType: e.eventType,
          latestEventTitle: e.eventTitleVi,
          publicDate: e.publicDate ? new Date(e.publicDate) : null,
          agmDate: e.agmDate ? new Date(e.agmDate) : null,
          exrightDate: e.exrightDate ? new Date(e.exrightDate) : null,
          recordDate: e.recordDate ? new Date(e.recordDate) : null,
          settlementDate: e.settlementDate ? new Date(e.settlementDate) : null,
          valuePerShare: e.valuePerShare,
          exerciseRatio: e.exerciseRatio,
        },
        update: {
          sector: entry.sector,
          latestEventType: e.eventType,
          latestEventTitle: e.eventTitleVi,
          publicDate: e.publicDate ? new Date(e.publicDate) : null,
          agmDate: e.agmDate ? new Date(e.agmDate) : null,
          exrightDate: e.exrightDate ? new Date(e.exrightDate) : null,
          recordDate: e.recordDate ? new Date(e.recordDate) : null,
          settlementDate: e.settlementDate ? new Date(e.settlementDate) : null,
          valuePerShare: e.valuePerShare,
          exerciseRatio: e.exerciseRatio,
        },
      });
    }

    // Xoa ma KHONG CON thoi su (khong nam trong lan quet nay nua) - tranh
    // du lieu "ma" ton dong vinh vien.
    const relevantTickers = relevantEntries.map((e) => e.ticker);
    await prisma.dividendUniverseEntry.deleteMany({
      where: { ticker: { notIn: relevantTickers.length > 0 ? relevantTickers : ["__NONE__"] } },
    });

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      totalUniverse: tickers.length,
      relevantCount: relevantEntries.length,
      relevantTickers,
    });
  } catch (err) {
    console.error("[cron/dividend-universe-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét universe lúc này." }, { status: 500 });
  }
}
