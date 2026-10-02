import { NextResponse } from "next/server";
import { CACHE_HEADERS, notFound, parseTickerQuarter, readCache } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";

// GET /api/cotuc/earnings-cycle-stats?ticker=&quarter=1..4 -> EarningsCycleStatsV3 (tính sẵn bởi cron earnings-seasonality-scan).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = parseTickerQuarter(req, true);
  if (p instanceof NextResponse) return p;
  try {
    const row = await readCache(p.ticker);
    const stats = (row?.stats as Record<string, unknown> | null)?.[String(p.quarter)];
    if (!stats) return notFound(row ? "Mã đã thu thập nhưng chưa chạy pha finalize." : "Mã chưa có trong danh mục quét mùa vụ.");
    return NextResponse.json(stats, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
