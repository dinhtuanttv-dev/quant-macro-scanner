import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// Quét liên tục (Gateway gọi lô mỗi 3 phút trong phiên) -> cache CDN ngắn để giao diện thấy dữ liệu mới.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

// GET /api/cotuc/decision-states[?ticker=FPT] -> DecisionSnapshot 3 trạng thái (FAVORABLE/WATCH/AVOID) của từng mã.
// CHỈ ĐỌC bảng CotucDecisionState (cron timing-signals-scan tính từ giá SSI + sự kiện VNDirect + mùa vụ KQKD).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase() || null;
    if (ticker !== null && !/^[A-Z0-9]{3,10}$/.test(ticker)) {
      return NextResponse.json({ error: "ticker không hợp lệ" }, { status: 400 });
    }
    const rows = await prisma.cotucDecisionState.findMany({ where: ticker ? { ticker } : undefined, orderBy: { ticker: "asc" } });
    if (ticker && rows.length === 0) {
      return NextResponse.json({ error: `Chưa có trạng thái quyết định cho ${ticker}` }, { status: 404, headers: CACHE_HEADERS });
    }
    const asOf = rows.reduce<Date | null>((m, r) => (!m || r.computedAt > m ? r.computedAt : m), null);
    return NextResponse.json(
      { asOf: asOf?.toISOString() ?? null, count: rows.length, states: rows.map((r) => r.snapshot) },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
