import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { refreshVnHolidayCalendar, vnHolidayCalendar } from "@/lib/cotuc/timing-v3/vn-holidays";
import { buildBuyTimeline, type DecisionInput, type SeasonInput, type StoredWindow } from "@/lib/cotuc/timing-v3/buy-timeline";
import type { EarningsCycleStatsV3, EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";

// GET /api/cotuc/buy-timeline -> Timeline điểm mua tối ưu (chu kỳ cổ tức + mùa vụ KQKD) cho cả danh mục, sắp theo ngày.
// CHỈ ĐỌC CotucDecisionState + EarningsSeasonalityCache (Gateway quét liên tục cập nhật hai bảng này).
export const dynamic = "force-dynamic";

const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

type Snap = {
  exDate?: { value: string; status: string } | null;
  decision?: { level?: "FAVORABLE" | "WATCH" | "AVOID" };
  signals?: { name: string; used: boolean; probability: number | null }[];
  backtest?: Partial<StoredWindow>[];
};

export async function GET() {
  try {
    await refreshVnHolidayCalendar();
    const [universe, decisionRows, seasonRows] = await Promise.all([
      getCotucUniverse(),
      prisma.cotucDecisionState.findMany({ select: { ticker: true, snapshot: true, computedAt: true } }),
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
    return NextResponse.json(
      {
        today,
        asOf: { decisions: latest(decisionRows.map((r) => r.computedAt)), seasonality: latest(seasonRows.map((r) => r.finalizedAt)) },
        coverage: { decisions: decisionRows.length, seasonality: seasonRows.length, universe: universe.tickers.length },
        counts: {
          validated: rows.filter((r) => r.tier === "VALIDATED").length, near: rows.filter((r) => r.tier === "NEAR").length,
          inWindow: rows.filter((r) => r.status === "IN_WINDOW").length, upcoming: rows.filter((r) => r.status === "UPCOMING").length,
        },
        rows,
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
