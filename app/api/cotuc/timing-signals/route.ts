import { NextResponse } from "next/server";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { buildCycleContext, buildCycleStatsV3, fetchBenchmarkPricesOnce } from "@/lib/cotuc/timing-v3/compute-cycle-io";
import { tradingDaysBetween, WEEKEND_ONLY_CALENDAR } from "@/lib/cotuc/timing-v3/date-utils";

// Tich hop Sprint 4-5 (Screener 4 cot moi): endpoint MOI, tinh
// TimingSignal THEO LO cho CA vu tru trong MOT request (khong nhan
// tham so ticker) - de Screener KHONG can goi optimizeDividendTiming
// rieng cho tung dong (70+ lenh goi mang).
//
// GIOI HAN THAT (minh bach, khong bia):
//  1. "exDate tham chieu" dung EXDATE GAN NHAT trong bang
//     DividendCycleWindow (lich su, khong phai nguon "sap toi" xac
//     thuc rieng) - neu ma CHUA co dot moi duoc VCI cong bo sau dot
//     gan nhat, tdToEx se AM (action=POST_EX), phan anh dung thuc te
//     "chua co lich moi trong DB", KHONG PHAI loi tinh sai.
//  2. "earnings" (tang truong YoY) de NULL - goi VCI cho TUNG ma trong
//     1 request bulk se rat cham/rui ro rate-limit (VCI dang bi chan
//     403 thoi diem viet code nay) - co the bo sung sau bang cach doc
//     tu bang du lieu da co san (VD SieuQuetStockItem) neu can chinh
//     xac hon, ngoai pham vi Sprint nay.
//  3. Xu ly THEO LO (batch 8 ma/luot) chay SONG SONG trong lo, TUAN TU
//     giua cac lo - can bang giua toc do va tranh rate-limit Yahoo/
//     VNDirect (da co tien le rate-limit tu HOSE truoc do).
//  4. FIX TIMEOUT (2026-09-26, xac nhan qua kiem tra thuc te): ban dau
//     tinh cho TOAN BO stockUniverse (~57 ma) bi FUNCTION_INVOCATION_
//     TIMEOUT that su (Vercel bao loi ro rang) - da doi sang CHI tinh
//     cho DIVIDEND_STOCKS (17-18 ma chinh, khong phai toan bo universe
//     mo rong). Day la GIAI PHAP NHANH duoc chon co chu dich (khong
//     phai gioi han vinh vien) - neu can day du ca universe sau nay,
//     giai phap ben vung hon la chuyen sang mo hinh cron tinh truoc +
//     luu DB (giong sector-top20-scan da lam cho Elite 10), thay vi
//     tinh real-time trong 1 request.
export const dynamic = "force-dynamic";
// FIX TIMEOUT LAN 2 (2026-09-26): sau khi giam tu ~57 xuong 17-18 ma
// van FUNCTION_INVOCATION_TIMEOUT - xac nhan qua tai lieu Vercel CHINH
// THUC moi nhat (vercel.com/docs/functions/limitations): Hobby plan
// HIEN TAI (2026) cho phep toi da 300s (5 phut), KHONG PHAI 60s nhu
// nhieu blog cu (co the phan anh chinh sach TRUOC KHI Vercel chuyen
// sang "Fluid Compute" mac dinh). maxDuration=60 cu la TU GIOI HAN
// CUA CHINH CODE (thap hon plan cho phep that), khong phai gioi han
// cua Vercel - tang len 300 de khop dung.
export const maxDuration = 300;

const BATCH_SIZE = 8;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET() {
  try {
    const benchmarkPrices = await fetchBenchmarkPricesOnce();
    if ("reason" in benchmarkPrices) {
      console.error(`[api/cotuc/timing-signals] Loi benchmark: ${benchmarkPrices.detail}`);
      return NextResponse.json({ error: "Không tải được giá VN-Index.", detail: benchmarkPrices.detail }, { status: 500 });
    }

    const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);
    const today = new Date().toISOString().slice(0, 10);
    const signals: Array<{
      ticker: string; action: string; tdToEx: number | null;
      window: { entryFrom: number; entryTo: number; exitOffset: number } | null;
      expectedNetReturn: number | null; nEvents: number | null; fdrQValue: number | null;
      confidence: "HIGH" | "MEDIUM" | "LOW" | null; dateStatus: null;
      earnings: null;
    }> = [];

    for (const batch of chunk(tickers, BATCH_SIZE)) {
      const results = await Promise.all(
        batch.map(async (ticker) => {
          const ctx = await buildCycleContext(ticker, benchmarkPrices);
          if ("reason" in ctx) return null; // thieu du lieu - bo qua, Screener se dung EMPTY_SIGNAL

          const stats = buildCycleStatsV3(ctx);
          const selected = stats.selectedWindowId !== null
            ? stats.windows.find((w) => w.id === stats.selectedWindowId && w.selected)
            : undefined;

          // exDate GAN NHAT (moi nhat trong lich su) lam moc tinh tdToEx -
          // xem GIOI HAN THAT o comment dau file.
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

          let confidence: "HIGH" | "MEDIUM" | "LOW" | null = null;
          if (selected) {
            confidence = selected.nEvents >= 12 && (selected.oosMeanNet ?? -1) > 0 ? "HIGH" : selected.nEvents >= 8 ? "MEDIUM" : "LOW";
          }

          return {
            ticker, action, tdToEx,
            window: selected ? { entryFrom: selected.entryFrom, entryTo: selected.entryTo, exitOffset: selected.exitOffset } : null,
            expectedNetReturn: selected?.netExpectancyLcb ?? null,
            nEvents: selected?.nEvents ?? null,
            fdrQValue: selected?.fdrQValue ?? null,
            confidence, dateStatus: null, earnings: null,
          };
        }),
      );
      for (const r of results) if (r) signals.push(r);
    }

    return NextResponse.json({ version: "v3-p5", asOf: today, signals });
  } catch (err) {
    console.error("[api/cotuc/timing-signals] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Timing Signals lúc này." }, { status: 500 });
  }
}
