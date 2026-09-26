import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchIndexOhlcvHistory } from "@/lib/market-data/vndirect-adapter";

// ROUTE DEBUG TAM THOI - da LOAI TRU hoan toan Prisma/database (4
// loai query deu NHANH ~2.6s tong cong). Buoc con lai trong
// buildCycleContext la 2 nguon gia: Yahoo (co phieu MWG) va VNDirect
// (VN-Index) - test RIENG TUNG NGUON de biet chinh xac dau la diem
// treo THAT SU.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase() ?? "MWG";
  const timings: Record<string, number> = {};
  let t = Date.now();

  console.error(`[debug-prices] ${ticker} - Yahoo BAT DAU`);
  const stockRes = await fetchOhlcvHistory(ticker, "5y");
  timings.yahooStock = Date.now() - t; t = Date.now();
  console.error(`[debug-prices] ${ticker} - Yahoo XONG (${timings.yahooStock}ms), success=${stockRes.success}, so_phien=${stockRes.data?.length ?? 0}`);

  console.error(`[debug-prices] ${ticker} - VNDirect BAT DAU`);
  const benchRes = await fetchIndexOhlcvHistory("VNINDEX", 1825);
  timings.vndirectBenchmark = Date.now() - t;
  console.error(`[debug-prices] ${ticker} - VNDirect XONG (${timings.vndirectBenchmark}ms), success=${benchRes.success}, so_phien=${benchRes.data?.length ?? 0}`);

  return NextResponse.json({
    ticker, timings,
    yahoo: { success: stockRes.success, count: stockRes.data?.length ?? 0, error: stockRes.error ?? null },
    vndirect: { success: benchRes.success, count: benchRes.data?.length ?? 0, error: benchRes.error ?? null },
  });
}
