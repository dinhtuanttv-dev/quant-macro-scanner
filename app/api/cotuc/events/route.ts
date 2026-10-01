import { NextResponse } from "next/server";
import { fetchDividendEventsBatch, type VciEvent } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { prisma, withPrismaTimeout } from "@/lib/prisma";

// FIX P0 (2026-09-12): 10s qua thap cho 17 request song song toi VCI.
export const maxDuration = 30;
// Dam bao route nay LUON chay lai (khong bi Next.js coi la static va
// cache) - giu lai nhu 1 best-practice an toan cho du khong phai nguyen
// nhan cua loi da debug truoc do (loi do la do doc nham JSON qua
// PowerShell console, khong phai bug code hay cache that).
export const dynamic = "force-dynamic";

/** Kieu 1 dong cache doc tu DividendEventCache (Buoc 2.1/2.2) - khai bao
 * tuong minh va truyen qua generic cua withPrismaTimeout<T>() (giong
 * pattern da dung o lib/cotuc/timing-v3/compute-cycle-io.ts) de dam bao
 * suy luan kieu dung ngay ca khi Prisma Client chua duoc generate day du
 * trong moi truong build (vd sandbox CI chua co DATABASE_URL). */
interface CachedEventRow {
  ticker: string;
  latestEventType: string | null;
  latestEventTitle: string | null;
  publicDate: Date | null;
  agmDate: Date | null;
  exrightDate: Date | null;
  settlementDate: Date | null;
  exerciseRatio: number | null;
  lastSuccessAt: Date | null;
}

/** Dung "DividendEventCache" (Buoc 2.1/2.2) de dung lai 1 su kien duy
 * nhat (latest*) thanh cau truc VciEvent - dung khi VCI live loi cho
 * dung ma nay, de FE van nhan duoc ngay THAT gan nhat da biet thay vi
 * roi thang ve mau tinh. KHONG bia them field nao khong co trong cache. */
function cacheRowToSyntheticEvent(row: CachedEventRow): VciEvent | null {
  if (!row.exrightDate) return null;
  return {
    eventCode: row.latestEventType === "CASH" ? "DIV" : "ISS",
    publicDate: row.publicDate ? row.publicDate.toISOString().slice(0, 10) : null,
    exerciseDate: row.exrightDate.toISOString().slice(0, 10),
    eventTitle: row.latestEventTitle,
    ratio: row.exerciseRatio !== null ? String(row.exerciseRatio) : null,
    settlementDate: row.settlementDate ? row.settlementDate.toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const results = await fetchDividendEventsBatch(tickers);
    const successCount = results.filter((r) => r.available).length;

    // Buoc 2.3 (nang cap do ben, 2026-09-27): CHI doc DividendEventCache
    // cho NHUNG MA fetch VCI live LOI ngay luc nay - khong doi hanh vi
    // cho ma fetch thanh cong (van dung nguyen ket qua live + lifecycle
        // day du nhu truoc). Muc dich: khi VCI chap chon, FE nhan duoc
    // "du lieu THAT gan nhat da biet" (tu cache, do Cron Buoc 2.2 ghi
    // dinh ky) thay vi roi thang ve du lieu mau tinh nhu truoc day.
    const failedTickers = results.filter((r) => !r.available).map((r) => r.ticker);
    const cacheRows: CachedEventRow[] = failedTickers.length > 0
      ? await withPrismaTimeout<CachedEventRow[]>(
          prisma.dividendEventCache.findMany({ where: { ticker: { in: failedTickers } } }),
          8_000,
          "events-cache-fallback",
        ).catch((err) => {
          console.error("[api/cotuc/events] Loi doc cache fallback (bo qua, giu ket qua live):", err);
          return [] as CachedEventRow[];
        })
      : [];
    const cacheByTicker = new Map(cacheRows.map((r) => [r.ticker, r]));

    // P1: them field MOI "lifecycleEvents" (5 moc thuc te da chuan hoa +
    // phan loai CASH/STOCK_DIVIDEND/BONUS_ISSUE/ESOP) - CHI THEM, khong
    // xoa cac field cu (exDividendEvents/agmEvents) de khong pha vo
    // useDividendEvents.ts dang dung. Bo "rawEvents" khoi response cuoi
    // (chi dung noi bo de build lifecycleEvents) - tranh payload thua.
    const resultsWithLifecycle = results.map((r) => {
      const { rawEvents, ...rest } = r;

      if (r.available) {
        return { ...rest, lifecycleEvents: buildLifecycleEvents(r.ticker, rawEvents), servedFromCache: false };
      }

      // VCI live loi cho ma nay - thu fallback ve cache (neu co du lieu
      // THAT tu lan thanh cong truoc). KHONG co lifecycleEvents day du
      // (cache chi luu 1 su kien "lien quan nhat", khong luu ca lich
      // su) - Timeline panel se hien rong cho ma nay, TRUNG THUC hon la
      // bia du lieu khong co.
      const cacheRow = cacheByTicker.get(r.ticker);
      const synthetic = cacheRow ? cacheRowToSyntheticEvent(cacheRow) : null;

      if (!synthetic) {
        // Khong co cache (ma qua moi/chua tung fetch thanh cong lan nao)
        // - giu nguyen hanh vi cu (available:false, FE tu fallback mau).
        return { ...rest, lifecycleEvents: [], servedFromCache: false };
      }

      const agmSynthetic: VciEvent | null = cacheRow?.agmDate
        ? {
            eventCode: "AGME",
            publicDate: null,
            exerciseDate: cacheRow.agmDate.toISOString().slice(0, 10),
            eventTitle: null,
            ratio: null,
            settlementDate: null,
          }
        : null;

      return {
        ticker: r.ticker,
        available: true, // THAT (tu cache, khong phai bia) - co ngay GDKHQ/thanh toan da xac nhan tu lan fetch thanh cong truoc
        exDividendEvents: [synthetic],
        agmEvents: agmSynthetic ? [agmSynthetic] : [],
        lifecycleEvents: [],
        servedFromCache: true,
        cacheAsOf: cacheRow?.lastSuccessAt ? cacheRow.lastSuccessAt.toISOString() : null,
      };
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      successCount,
      cacheFallbackCount: resultsWithLifecycle.filter((r) => "servedFromCache" in r && r.servedFromCache).length,
      results: resultsWithLifecycle,
    });
  } catch (err) {
    console.error("[api/cotuc/events] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải sự kiện GDKHQ/ĐHCĐ lúc này." }, { status: 500 });
  }
}
