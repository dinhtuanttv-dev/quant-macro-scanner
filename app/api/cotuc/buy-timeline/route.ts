import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readThroughByVersion } from "@/lib/cotuc/data-version";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { refreshVnHolidayCalendar, vnHolidayCalendar, vnHolidayCalendarVersion } from "@/lib/cotuc/timing-v3/vn-holidays";
import { cotucSourceStamp, loadDecisionForTimeline, memoByStamp } from "@/lib/cotuc/decision-state-lite";
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

// Băng thông Supabase (2026-10-15): route được thanh bên gọi trên MỌI tab. Kết quả chỉ phụ thuộc: ngày hôm nay, lịch nghỉ,
// danh mục (Gateway), CotucDecisionState, EarningsSeasonalityCache -> đệm theo dấu của các nguồn đó; nguồn không đổi thì trả lại
// đúng kết quả lần trước (giống hệt), đổi thì đọc & tính lại. Nhánh snapshot chỉ lấy exDate, decision.level, signals, backtest.
type Universe = Awaited<ReturnType<typeof getCotucUniverse>>;
let lastUniverse: Universe | null = null;
let lastInputs = "";
// N2: kết quả còn đệm trong KV theo phiên bản dữ liệu Cổ tức (khoá gồm ngày, lịch nghỉ, danh mục) -> phiên bản bản Vercel
// mới khởi động cũng không phải đọc Neon khi dữ liệu không đổi.
const timelineCached = memoByStamp(async () => {
  await refreshVnHolidayCalendar();
  lastUniverse = await getCotucUniverse();
  const uni = lastUniverse.tickers.map((t) => `${t.ticker}:${t.sector ?? ""}`).join(",");
  lastInputs = [vnToday(), vnHolidayCalendarVersion(), uni].join("#");
  return [lastInputs, await cotucSourceStamp()].join("#");
}, () => {
  const universe = lastUniverse!;
  return readThroughByVersion(`buy-timeline:${createHash("sha1").update(lastInputs).digest("hex").slice(0, 16)}`, () => buildBody(universe));
});

export async function GET() {
  try {
    return NextResponse.json(await timelineCached(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (e) {
    // N4: không trả nguyên văn lỗi Prisma/CSDL ra trình duyệt — ghi log phía máy chủ.
    console.error("[api/cotuc/buy-timeline] Lỗi:", e);
    return NextResponse.json({ error: "Không tải được Timeline điểm mua lúc này." }, { status: 500 });
  }
}

async function buildBody(universe: Universe) {
  {
    const [decisionRows, seasonRows] = await Promise.all([
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
    return (
      {
        today,
        asOf: { decisions: latest(decisionRows.map((r) => r.computedAt)), seasonality: latest(seasonRows.map((r) => r.finalizedAt)) },
        coverage: { decisions: decisionRows.length, seasonality: seasonRows.length, universe: universe.tickers.length },
        counts: {
          validated: rows.filter((r) => r.tier === "VALIDATED").length, near: rows.filter((r) => r.tier === "NEAR").length,
          inWindow: rows.filter((r) => r.status === "IN_WINDOW").length, upcoming: rows.filter((r) => r.status === "UPCOMING").length,
        },
        rows,
      }
    );
  }
}
