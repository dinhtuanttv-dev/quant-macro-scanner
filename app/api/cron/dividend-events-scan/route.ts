import { NextResponse } from "next/server";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents, type DividendLifecycleEvent } from "@/lib/cotuc/dividend-lifecycle";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { prisma } from "@/lib/prisma";

// Buoc 2.2 (nang cap do ben cho Tab Co Tuc, 2026-09-27) - cron ghi
// DividendEventCache CHO TAT CA MA dang duoc theo doi (hop nhat 17 ma
// theo doi goc DIVIDEND_STOCKS ∪ toan bo ma da co trong
// DividendUniverseEntry) - KHONG phan biet nguon, dung 1 cache duy nhat.
//
// NGUYEN TAC AN TOAN QUAN TRONG NHAT (khac voi dividend-universe-scan.
// route.ts - route do XOA het entry "khong con thoi su", tung gay mat
// TOAN BO du lieu Universe khi VCI 403 tra ve rong cho moi ma): route
// nay TUYET DOI KHONG XOA/GHI NULL len du lieu cu khi 1 ma fetch LOI -
// CHI ghi de field ngay/su kien khi fetch ma do THANH CONG (available
// true). Fetch loi CHI cap nhat lastAttemptAt/lastError, giu nguyen
// nguyen ven cac field ngay da luu tu lan thanh cong truoc do. Nho vay
// 1 lan VCI chap chon (403) KHONG lam "bay sach" cache nhu da xay ra
// voi DividendUniverseEntry.
export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Chon 1 su kien DIV/ISS "dang can quan tam nhat" trong danh sach da
 * chuan hoa (buildLifecycleEvents KHONG tu sort) - cung logic da dung
 * o dividend-universe-scan/route.ts (sap toi GAN NHAT truoc, qua khu
 * GAN DAY sau) de nhat quan trong toan du an. */
function pickMostRelevantEvent(events: DividendLifecycleEvent[]): DividendLifecycleEvent | null {
  const withDate = events.filter((e) => e.exrightDate !== null);
  if (withDate.length === 0) return null;
  const now = Date.now();
  const sorted = [...withDate].sort((a, b) => {
    const ta = new Date(a.exrightDate as string).getTime();
    const tb = new Date(b.exrightDate as string).getTime();
    const aFuture = ta >= now, bFuture = tb >= now;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return Math.abs(ta - now) - Math.abs(tb - now);
  });
  return sorted[0];
}

export async function GET() {
  try {
    const coreTickers = DIVIDEND_STOCKS.map((s) => s.ticker);
    const universeRows = await prisma.dividendUniverseEntry.findMany({ select: { ticker: true } });
    const universeTickers = universeRows.map((r) => r.ticker);
    // Hop nhat, khong trung lap - "TAT CA MA" theo dung yeu cau, khong
    // con phan biet "17 ma co dinh" nua o tang cache nay.
    const scanUniverse = (await getCotucUniverse()).tickers.map((t) => t.ticker); // danh mục Siêu Quét AI (~300 mã)
    const allTickers = Array.from(new Set([...coreTickers, ...scanUniverse, ...universeTickers]));

    const results = await fetchDividendEventsBatch(allTickers);
    const now = new Date();

    let successCount = 0;
    let failCount = 0;
    let noEventCount = 0;

    for (const r of results) {
      if (!r.available) {
        failCount++;
        // CHI cap nhat metadata loi - KHONG dong den field ngay/su kien
        // da luu tu lan thanh cong truoc (neu chua co dong nao, tao
        // dong moi CHI VOI metadata, cac field ngay se la null tu dau,
        // khong phai "bi xoa").
        await prisma.dividendEventCache.upsert({
          where: { ticker: r.ticker },
          create: { ticker: r.ticker, lastAttemptAt: now, lastError: r.error ?? "Không rõ nguyên nhân" },
          update: { lastAttemptAt: now, lastError: r.error ?? "Không rõ nguyên nhân" },
        });
        continue;
      }

      const lifecycle = buildLifecycleEvents(r.ticker, r.rawEvents);
      const latest = pickMostRelevantEvent(lifecycle);

      if (!latest) {
        // VCI tra ve THANH CONG nhung khong co su kien DIV/ISS nao co
        // ngay GDKHQ ro rang - van la "thanh cong" (khong phai loi),
        // chi cap nhat lastSuccessAt/lastAttemptAt, KHONG xoa du lieu cu
        // (co the mã tam thoi khong co su kien moi, du lieu cu van con
        // gia tri tham khao).
        noEventCount++;
        await prisma.dividendEventCache.upsert({
          where: { ticker: r.ticker },
          create: { ticker: r.ticker, lastSuccessAt: now, lastAttemptAt: now, lastError: null },
          update: { lastSuccessAt: now, lastAttemptAt: now, lastError: null },
        });
        continue;
      }

      successCount++;
      const data = {
        latestEventType: latest.eventType,
        latestEventTitle: latest.eventTitleVi,
        publicDate: latest.publicDate ? new Date(latest.publicDate) : null,
        agmDate: latest.agmDate ? new Date(latest.agmDate) : null,
        exrightDate: latest.exrightDate ? new Date(latest.exrightDate) : null,
        recordDate: latest.recordDate ? new Date(latest.recordDate) : null,
        settlementDate: latest.settlementDate ? new Date(latest.settlementDate) : null,
        valuePerShare: latest.valuePerShare,
        exerciseRatio: latest.exerciseRatio,
        lastSuccessAt: now,
        lastAttemptAt: now,
        lastError: null,
      };
      await prisma.dividendEventCache.upsert({
        where: { ticker: r.ticker },
        create: { ticker: r.ticker, ...data },
        update: data,
      });
    }

    return NextResponse.json({
      scannedAt: now.toISOString(),
      totalTickers: allTickers.length,
      successCount,
      noEventCount,
      failCount,
    });
  } catch (err) {
    console.error("[cron/dividend-events-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét sự kiện cổ tức lúc này." }, { status: 500 });
  }
}
