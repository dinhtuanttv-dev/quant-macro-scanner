import { NextResponse } from "next/server";
import { buildCycleContext, buildCyclePathsV3, buildCycleStatsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";
import { loadBacktestRates } from "@/lib/cotuc/decision-state-lite";
import { readCache } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";
import { storeList, cotucErrorCode } from "@/lib/cotuc/store/gateway-store";
import { assembleEventStudy, type UpcomingEvent } from "@/lib/cotuc/timing-v3/event-study";
import type { BacktestWindow, EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";

// CH0 (29/10/2026) — GET /api/cotuc/event-study?ticker=FPT&kind=DIVIDEND|EARNINGS[&quarter=1..4]
// Một lần gọi cho chart mô phỏng thời điểm (Elite 10 › Hồ sơ 360°): đường CAR từng đợt + cửa sổ v3 + phí + prior + mốc sắp tới.
// CHỈ ĐỌC engine v3 sẵn có (cổ tức: buildCycleContext như /cycle-stats-v3 và /cycle-paths; KQKD: kho mùa vụ đã finalize) — không
// thêm công thức. Tab Cổ tức không dùng route này.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TICKER_RE = /^[A-Z0-9]{3,10}$/;
const CACHE = { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const kind = (searchParams.get("kind") ?? "DIVIDEND").toUpperCase();
  if (!TICKER_RE.test(ticker)) return NextResponse.json({ error: "Mã không hợp lệ." }, { status: 400 });
  if (kind !== "DIVIDEND" && kind !== "EARNINGS") return NextResponse.json({ error: "kind phải là DIVIDEND hoặc EARNINGS." }, { status: 400 });
  try {
    if (kind === "DIVIDEND") {
      const ctx = await buildCycleContext(ticker);
      if ("reason" in ctx) return NextResponse.json({ error: "Không đủ dữ liệu giá / lịch sử cổ tức cho mã này.", reason: ctx.reason }, { status: 404 });
      const paths = buildCyclePathsV3(ctx), stats = buildCycleStatsV3(ctx);
      const [rates, dec] = await Promise.all([
        loadBacktestRates(),
        storeList<{ ticker: string; snapshot?: { exDate?: { value: string; status: string; label?: string; source?: string } | null } }>("decision", { tickers: [ticker], fields: ["ticker", "snapshot.exDate"] }),
      ]);
      const ex = dec[0]?.snapshot?.exDate ?? null;
      const upcoming: UpcomingEvent | null = ex ? { date: ex.value, status: ex.status, label: ex.label ?? null, source: ex.source ?? "VNDIRECT" } : null;
      return NextResponse.json(assembleEventStudy({
        ticker, kind, quarter: null, version: stats.version, asOf: stats.asOf, offsets: paths.offsets, eventPaths: paths.eventPaths,
        currentPath: (paths as { currentPath?: { car?: (number | null)[] } | null }).currentPath?.car ?? null,
        windows: stats.windows, selectedWindowId: stats.selectedWindowId,
        otherRates: rates.filter((r) => r.ticker !== ticker).flatMap((r) => r.bt),
        upcoming, notes: ["Mốc sự kiện = ngày GDKHQ; CAR = lợi suất log vượt VN-Index cộng dồn trên giá tổng lợi suất (cổ tức đã gộp vào giá)."],
      }), { headers: CACHE });
    }

    // KQKD: quý = tham số, hoặc quý của kỳ công bố sắp tới (earningsSignal).
    const row = await readCache(ticker);
    if (!row) return NextResponse.json({ error: "Mã chưa có trong danh mục quét mùa vụ KQKD." }, { status: 404 });
    const sig = (row.earningsSignal ?? null) as EarningsSignal | null;
    const qParam = Number(searchParams.get("quarter"));
    const q = [1, 2, 3, 4].includes(qParam) ? qParam : Number(/^Q([1-4])\//.exec(sig?.quarterLabel ?? "")?.[1] ?? 0);
    if (!q) return NextResponse.json({ error: "Chưa xác định được quý công bố sắp tới." }, { status: 404 });
    const paths = (row.paths as Record<string, { offsets: number[]; eventPaths: { exDate: string; car: (number | null)[] }[]; currentPath?: { car?: (number | null)[] } | null; version?: string; asOf?: string }> | null)?.[String(q)];
    const st = (row.stats as Record<string, { windows: BacktestWindow[]; selectedWindowId: string | null }> | null)?.[String(q)];
    if (!paths || !st) return NextResponse.json({ error: `Chưa có dữ liệu mùa vụ Q${q} đã finalize.` }, { status: 404 });
    const others = await storeList<{ ticker: string; stats?: Record<string, { windows?: BacktestWindow[] }> | null }>("season", { fields: ["ticker", "stats"] });
    const otherRates = others.filter((o) => o.ticker !== ticker).flatMap((o) => (o.stats?.[String(q)]?.windows ?? []).map((w) => ({ id: w.id, nEvents: w.nEvents, winRate: w.winRate })));
    const sameQuarter = sig && Number(/^Q([1-4])\//.exec(sig.quarterLabel)?.[1]) === q;
    const upcoming: UpcomingEvent | null = sameQuarter
      ? { date: sig.expectedAnnounce.date, status: sig.expectedAnnounce.method, label: `Công bố KQKD ${sig.quarterLabel}`, source: "VNDIRECT_BCTC" } : null;
    return NextResponse.json(assembleEventStudy({
      ticker, kind, quarter: q, version: paths.version ?? "v3-seasonality", asOf: String(paths.asOf ?? new Date().toISOString()).slice(0, 10),
      offsets: paths.offsets, eventPaths: paths.eventPaths, currentPath: paths.currentPath?.car ?? null,
      windows: st.windows, selectedWindowId: st.selectedWindowId, otherRates, upcoming,
      notes: [`Mốc sự kiện = ngày công bố BCTC Q${q} (lịch sử: ngày công bố thật; sắp tới: ước lượng theo độ trễ lịch sử).`,
        "Prior chart = tỷ lệ thắng của các mã khác cùng quý (toàn danh mục); xác suất v3 của tab Cổ tức dùng prior ngành × quý — có thể khác nhẹ."],
    }), { headers: CACHE });
  } catch (e) {
    console.error("[api/cotuc/event-study]", e);
    return NextResponse.json({ error: "Không tải được nghiên cứu sự kiện lúc này.", code: cotucErrorCode(e) }, { status: 500 });
  }
}
