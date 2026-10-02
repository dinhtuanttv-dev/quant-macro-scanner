import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { stockUniverse } from "@/lib/quant-data";
import { loadBenchmarkPrices, loadStockPrices } from "@/lib/cotuc/timing-v3/price-source";
import { buildEarningsSignalForTicker } from "@/lib/cotuc/timing-v3/earnings-signal-io";
import {
  QUARTERS, buildSeasonalitySamples, fetchAnnounceDates, finalizeTicker,
  type AnnounceByQuarter, type CollectedTicker, type SamplesByQuarter,
} from "@/lib/cotuc/timing-v3/seasonality/seasonality-io";

// Mua vu KQKD theo quy - cron 2 pha (giong mo hinh timing-signals-scan: chia lo offset/limit vi gioi han thoi gian
// thuc cua Vercel tren tai khoan nay thap hon tai lieu):
//   ?phase=collect&offset=0&limit=3  -> moi ma: gia SSI (tong loi suat sau thue) + ngay cong bo CafeF + CAR quanh
//                                       ngay cong bo + EarningsSignal; ghi EarningsSeasonalityCache.
//   ?phase=finalize                  -> prior nganh x quy x cua so tu CA danh muc da thu thap, thong ke ca nam + lich.
// Mac dinh (Vercel Cron goi khong tham so): collect toan bo danh sach roi finalize.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH = 3;
/** 10 năm giá SSI (2016→nay): mỗi quý ~10 kỳ công bố thay vì ~5 — đủ mẫu hơn cho kiểm định đa so sánh 4 quý × 4 cửa sổ. */
const SEASONALITY_YEARS = 10;

/** Chuẩn hoá về JSON thuần cho cột Json của Prisma (bỏ undefined, Map...). */
const toJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

async function collect(tickers: string[]) {
  const bench = await loadBenchmarkPrices(SEASONALITY_YEARS);
  if (!bench.ok) throw new Error(`Không tải được VN-Index: ${bench.error}`);
  const asOf = new Date().toISOString();
  const results: { ticker: string; ok: boolean; detail: string }[] = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    await Promise.all(tickers.slice(i, i + BATCH).map(async (ticker) => {
      try {
        const sector = DIVIDEND_STOCKS.find((s) => s.ticker === ticker)?.sector ?? stockUniverse.find((s) => s.ticker === ticker)?.sector ?? null;
        const isBank = stockUniverse.find((s) => s.ticker === ticker)?.sector === "Ngan hang";
        const [prices, ann, signal] = await Promise.all([loadStockPrices(ticker, SEASONALITY_YEARS), fetchAnnounceDates(ticker), buildEarningsSignalForTicker(ticker, isBank)]);
        if (!prices.ok) { results.push({ ticker, ok: false, detail: `giá: ${prices.error}` }); return; }
        if (!ann.ok) { results.push({ ticker, ok: false, detail: `ngày công bố: ${ann.error}` }); return; }
        const built = buildSeasonalitySamples(ticker, prices.prices, bench.prices, ann.announce, asOf);
        const notes = [...prices.notes, ...bench.notes, built.skipped ? `Bỏ qua ${built.skipped} kỳ công bố thiếu dữ liệu giá quanh ngày công bố.` : null].filter(Boolean);
        const data = {
          sector, announceDates: toJson(ann.announce), samples: toJson(built.samples), paths: toJson(built.paths),
          earningsSignal: "reason" in signal ? Prisma.DbNull : toJson(signal), priceSource: prices.source, notes: toJson(notes), collectedAt: new Date(),
        };
        await prisma.earningsSeasonalityCache.upsert({ where: { ticker }, create: { ticker, ...data }, update: data });
        const n = QUARTERS.reduce((s, q) => s + (ann.announce[String(q)]?.length ?? 0), 0);
        results.push({ ticker, ok: true, detail: `${n} kỳ công bố · giá ${prices.source}` });
      } catch (e) {
        results.push({ ticker, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }));
  }
  return results;
}

async function finalize() {
  const rows = await prisma.earningsSeasonalityCache.findMany();
  const all: CollectedTicker[] = rows.map((r) => ({
    ticker: r.ticker, sector: r.sector, samples: r.samples as unknown as SamplesByQuarter, announce: r.announceDates as unknown as AnnounceByQuarter,
  }));
  const asOf = new Date().toISOString();
  let done = 0;
  for (const t of all) {
    const { stats, calendar, priorScope } = finalizeTicker(t, all, asOf);
    const row = rows.find((r) => r.ticker === t.ticker)!;
    const baseNotes = ((row.notes as string[] | null) ?? []).filter((n) => !n.startsWith("Prior "));
    await prisma.earningsSeasonalityCache.update({
      where: { ticker: t.ticker },
      data: {
        stats: toJson(stats), calendar: toJson(calendar), finalizedAt: new Date(),
        notes: toJson([...baseNotes, `Prior theo quý: ${QUARTERS.map((q) => `Q${q} ${priorScope[q] === "INDUSTRY" ? "cùng ngành" : priorScope[q] === "UNIVERSE" ? "cả danh mục" : "trung tính"}`).join(", ")}.`]),
      },
    });
    done++;
  }
  return { finalized: done };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const phase = searchParams.get("phase");
    const offset = Number(searchParams.get("offset") ?? "0");
    const limit = Number(searchParams.get("limit") ?? "999");
    const tickers = DIVIDEND_STOCKS.map((s) => s.ticker).slice(offset, offset + limit);
    if (phase === "finalize") return NextResponse.json(await finalize());
    const collected = await collect(tickers);
    if (phase === "collect") return NextResponse.json({ collected });
    return NextResponse.json({ collected, ...(await finalize()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
