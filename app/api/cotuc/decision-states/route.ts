import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readThroughByVersion } from "@/lib/cotuc/data-version";
// Gateway quét theo đợt (N1: mỗi giờ trong phiên) + đọc qua KV theo phiên bản dữ liệu (N2) -> CDN 5 phút.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };

// GET /api/cotuc/decision-states[?ticker=FPT] -> DecisionSnapshot 3 trạng thái (FAVORABLE/WATCH/AVOID) của từng mã.
// CHỈ ĐỌC bảng CotucDecisionState (cron timing-signals-scan tính từ giá SSI + sự kiện VNDirect + mùa vụ KQKD).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase() || null;
    if (ticker !== null && !/^[A-Z0-9]{3,10}$/.test(ticker)) {
      return NextResponse.json({ error: "ticker không hợp lệ" }, { status: 400 });
    }
    const body = await readThroughByVersion(`decision-states:${ticker ?? "*"}`, async () => {
      const rows = await prisma.cotucDecisionState.findMany({ where: ticker ? { ticker } : undefined, orderBy: { ticker: "asc" } });
      const asOf = rows.reduce<Date | null>((m, r) => (!m || r.computedAt > m ? r.computedAt : m), null);
      return { asOf: asOf?.toISOString() ?? null, count: rows.length, states: rows.map((r) => r.snapshot) };
    });
    if (ticker && body.count === 0) {
      return NextResponse.json({ error: `Chưa có trạng thái quyết định cho ${ticker}` }, { status: 404, headers: CACHE_HEADERS });
    }
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (e) {
    console.error("[api/cotuc/decision-states] Lỗi:", e);
    return NextResponse.json({ error: "Không tải được trạng thái quyết định lúc này." }, { status: 500 });
  }
}
