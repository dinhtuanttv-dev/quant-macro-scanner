import { NextResponse } from "next/server";
import { storeList, withDates } from "@/lib/cotuc/store/gateway-store";
import { CACHE_HEADERS } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";
import { buildSeasonalOpportunities } from "@/lib/cotuc/timing-v3/seasonality/opportunities";
import type { EarningsCycleStatsV3 } from "@/lib/cotuc/timing-v3/timing-types";

import { withCdnCache } from "@/lib/http/cdnCache";
// GET /api/cotuc/seasonal-opportunities -> cơ hội mùa vụ KQKD toàn danh mục (đã đạt kiểm định, xếp theo cận dưới CI)
// + ứng viên gần đạt (ghi rõ còn thiếu gì). Đọc EarningsSeasonalityCache (cron earnings-seasonality-scan).
export const dynamic = "force-dynamic";

async function getUncached() {
  try {
    // B2: kho Cổ tức trên Gateway (thay Neon).
    const rows = (await storeList<{ ticker: string; stats: unknown; finalizedAt: string | null }>("season", { fields: ["ticker", "stats", "finalizedAt"] }))
      .map((r) => withDates(r, ["finalizedAt"] as const));
    const statsByTicker = Object.fromEntries(rows.filter((r) => r.stats).map((r) => [r.ticker, r.stats as unknown as Record<string, EarningsCycleStatsV3>]));
    const asOf = rows.reduce<Date | null>((m, r) => (r.finalizedAt && (!m || r.finalizedAt > m) ? r.finalizedAt : m), null);
    return NextResponse.json({ asOf: asOf?.toISOString() ?? null, tickers: rows.length, ...buildSeasonalOpportunities(statsByTicker) }, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 300 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 300);
