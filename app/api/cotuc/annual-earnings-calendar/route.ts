import { NextResponse } from "next/server";
import { CACHE_HEADERS, notFound, parseTickerQuarter, readCache } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";

import { withCdnCache } from "@/lib/http/cdnCache";
// GET /api/cotuc/annual-earnings-calendar?ticker= -> AnnualEarningsCalendarV3 (4 quý: tháng công bố điển hình,
// mô hình Student-t ngày công bố, xác suất phản ứng Beta-Binomial).
export const dynamic = "force-dynamic";

async function getUncached(req: Request) {
  const p = parseTickerQuarter(req, false);
  if (p instanceof NextResponse) return p;
  try {
    const row = await readCache(p.ticker);
    if (!row?.calendar) return notFound(row ? "Mã đã thu thập nhưng chưa chạy pha finalize." : "Mã chưa có trong danh mục quét mùa vụ.");
    return NextResponse.json(row.calendar, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 300 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 300);
