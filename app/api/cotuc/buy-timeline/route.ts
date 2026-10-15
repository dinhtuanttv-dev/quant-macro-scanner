import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { refreshVnHolidayCalendar, vnHolidayCalendar } from "@/lib/cotuc/timing-v3/vn-holidays";
import { buildBuyTimeline, type DecisionInput, type SeasonInput, type StoredWindow } from "@/lib/cotuc/timing-v3/buy-timeline";
import type { EarningsCycleStatsV3, EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";
import { loadDecisionForTimeline, memoTtl } from "@/lib/cotuc/decision-state-lite";

// GET /api/cotuc/buy-timeline -> Timeline điểm mua tối ưu (chu kỳ cổ tức + mùa vụ KQKD) cho cả danh mục, sắp theo ngày.
// CHỈ ĐỌC CotucDecisionState + EarningsSeasonalityCache (Gateway quét liên tục cập nhật hai bảng này).
//
// BĂNG THÔNG SUPABASE (10/2026): route này được thanh bên Elite Command Radar gọi trên MỌI tab. Trước đây mỗi phút đọc NGUYÊN
// `snapshot` của ~281 mã. Nay: chỉ đọc các nhánh JSON cần (decision-state-lite), kết quả đệm 10 phút / instance + CDN 10 phút.
export const dynamic = "force-dynamic";

const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

type Snap = {
  exDate?: { value: string; status: string } | null;
  decision?: { level?: "FAVORABLE" | "WATCH" | "AVOID" };
  signals?: { name: string; used: boolean; probability: number | null }[];
  backtest?: Partial<StoredWindow>[];
};

async function build() {
  await refreshVnHolidayCalendar();
  const [universe, decisionRows, seasonRows] = await Promise.all([
    getCotucUniverse(),
    loadDecisionForTimeline(),
    prisma.earningsSeasonalityCache.findMany({ select: { ticker: true, earningsSignal: true, stats: true, finalizedAt: true } }),
  ]);
  const decisions: DecisionInput[] = decisionRows.map((r) => {
    const s = (r.snapshot ?? {}) as Snap;
    const windows = (s.backtest ?? []).filter((w): w is StoredWindow => typeof w.entryFrom === "number" && typeof w.netExpectancy === "number");
    return {
      ticker: r.ticker, exDate: s.exDate ?? null, decisionLevel: s.decision?.level ?? "AVOID",
      dividendProbability: s.signals?.find((x) => x.name === "Cổ tức" && x.used)?.probability ?? null, windows,
    };
  });
  const seasonality: SeasonInput[] = seasonRows.map((r) => ({
    ticker: r.ticker,
    earnings: (r.earningsSignal ?? null) as unknown as EarningsSignal | null,
    stats: (r.stats ?? null) as unknown as Partial<Record<string, EarningsCycleStatsV3>> | null,
  }));
  const today = vnToday();
  const rows = buildBuyTimeline({
    today, cal: vnHolidayCalendar, decisions, seasonality,
    sectors: new Map(universe.tickers.map((t) => [t.ticker, t.sector])),
  });
  const latest = (dates: (Date | null)[]) => dates.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null)?.toISOString() ?? null;
  return {
    today,
    asOf: { decisions: latest(decisionRows.map((r) => new Date(r.computedAt))), seasonality: latest(seasonRows.map((r) => r.finalizedAt)) },
    coverage: { decisions: decisionRows.length, seasonality: seasonRows.length, universe: universe.tickers.length },
    counts: {
      validated: rows.filter((r) => r.tier === "VALIDATED").length, near: rows.filter((r) => r.tier === "NEAR").length,
      inWindow: rows.filter((r) => r.status === "IN_WINDOW").length, upcoming: rows.filter((r) => r.status === "UPCOMING").length,
    },
    rows,
  };
}

const buildCached = memoTtl(10 * 60_000, build);

export async function GET() {
  try {
    return NextResponse.json(await buildCached(), { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
