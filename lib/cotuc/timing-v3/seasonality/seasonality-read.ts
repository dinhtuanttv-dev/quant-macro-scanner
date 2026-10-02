// Đọc kết quả Mùa vụ KQKD đã tính sẵn (EarningsSeasonalityCache) cho các route /api/cotuc/* — không tính toán ở đây.
// Hợp đồng lỗi khớp tầng fetch của frontend (seasonality.api.ts): 400 tham số sai, 404 = chưa có dữ liệu (client coi là null).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TICKER_RE = /^[A-Z0-9]{3,10}$/;

export function parseTickerQuarter(req: Request, needQuarter: boolean): { ticker: string; quarter: number | null } | NextResponse {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) return NextResponse.json({ error: "Mã không hợp lệ." }, { status: 400 });
  if (!needQuarter) return { ticker, quarter: null };
  const q = Number(searchParams.get("quarter"));
  if (![1, 2, 3, 4].includes(q)) return NextResponse.json({ error: "Quý phải là 1..4." }, { status: 400 });
  return { ticker, quarter: q };
}

export async function readCache(ticker: string) {
  return prisma.earningsSeasonalityCache.findUnique({ where: { ticker } });
}

export const notFound = (detail: string) => NextResponse.json({ error: "Chưa có dữ liệu mùa vụ KQKD.", detail }, { status: 404 });

/** Cache 10 phút ở CDN (dữ liệu chỉ đổi sau mỗi lần cron chạy), cho phép trả bản cũ khi đang làm mới. */
export const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" };
