import { NextResponse } from "next/server";
import { CACHE_HEADERS, notFound, parseTickerQuarter, readCache } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";

// GET /api/cotuc/earnings-cycle-paths?ticker=&quarter=1..4 -> CyclePathsV3 quanh NGÀY CÔNG BỐ BCTC của quý đó
// (computeCyclePaths tái dùng, ngày công bố thay cho GDKHQ; giá SSI tổng lợi suất sau thuế).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = parseTickerQuarter(req, true);
  if (p instanceof NextResponse) return p;
  try {
    const row = await readCache(p.ticker);
    const paths = (row?.paths as Record<string, unknown> | null)?.[String(p.quarter)];
    if (!paths) return notFound(row ? `Chưa có kỳ công bố Q${p.quarter} đủ dữ liệu giá.` : "Mã chưa có trong danh mục quét mùa vụ.");
    return NextResponse.json(paths, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
