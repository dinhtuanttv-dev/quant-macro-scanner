import { jobFail, jobOk, type JobResult } from "./job-result";
import { bumpCotucDataVersion } from "@/lib/cotuc/data-version";
import { storeList, storeUpsert } from "@/lib/cotuc/store/gateway-store";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { getCotucUniverse, type CotucUniverseTicker } from "@/lib/cotuc/cotuc-universe";
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
// B2 (25/10/2026): LƯU vào kho Cổ tức trên Gateway (Railway Volume) thay Neon — cùng cột, cùng giá trị; finalize ghi theo lô.
// 30/10/2026 (Vercel CPU giai đoạn 2): Market Gateway chạy job này trong tiến trình (lịch chính); route chỉ còn là vỏ gọi tay.

const BATCH = 3;
/** 10 năm giá SSI (2016→nay): mỗi quý ~10 kỳ công bố thay vì ~5 — đủ mẫu hơn cho kiểm định đa so sánh 4 quý × 4 cửa sổ. */
const SEASONALITY_YEARS = 10;

/** Chuẩn hoá về JSON thuần (bỏ undefined, Map...) — như cột Json trước đây. */
const toJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

async function collect(tickers: string[], meta: Map<string, CotucUniverseTicker>) {
  const bench = await loadBenchmarkPrices(SEASONALITY_YEARS);
  if (!bench.ok) throw new Error(`Không tải được VN-Index: ${bench.error}`);
  const asOf = new Date().toISOString();
  const results: { ticker: string; ok: boolean; detail: string }[] = [];
  for (let i = 0; i < tickers.length; i += BATCH) {
    await Promise.all(tickers.slice(i, i + BATCH).map(async (ticker) => {
      try {
        // Ngành: 17 mã gốc giữ ngành cũ; mã khác lấy ngành của danh mục Siêu Quét (prior mùa vụ tính theo ngành × quý).
        const sector = DIVIDEND_STOCKS.find((s) => s.ticker === ticker)?.sector ?? meta.get(ticker)?.sector ?? stockUniverse.find((s) => s.ticker === ticker)?.sector ?? null;
        const isBank = /ng[aâ]n h[aà]ng/i.test(sector ?? "") || stockUniverse.find((s) => s.ticker === ticker)?.sector === "Ngan hang";
        const [prices, ann, signal] = await Promise.all([loadStockPrices(ticker, SEASONALITY_YEARS), fetchAnnounceDates(ticker), buildEarningsSignalForTicker(ticker, isBank)]);
        if (!prices.ok) { results.push({ ticker, ok: false, detail: `giá: ${prices.error}` }); return; }
        if (!ann.ok) { results.push({ ticker, ok: false, detail: `ngày công bố: ${ann.error}` }); return; }
        const built = buildSeasonalitySamples(ticker, prices.prices, bench.prices, ann.announce, asOf);
        const notes = [...prices.notes, ...bench.notes, built.skipped ? `Bỏ qua ${built.skipped} kỳ công bố thiếu dữ liệu giá quanh ngày công bố.` : null].filter(Boolean);
        const data = {
          sector, announceDates: toJson(ann.announce), samples: toJson(built.samples), paths: toJson(built.paths),
          earningsSignal: "reason" in signal ? null : toJson(signal), priceSource: prices.source, notes: toJson(notes), collectedAt: new Date(),
        };
        await storeUpsert("season", [{ ticker, ...data }]);
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
  // chỉ các cột finalize dùng (không kéo paths / stats / calendar — JSON rất lớn) — kết quả giống hệt
  const rows = await storeList<{ ticker: string; sector: string | null; samples: unknown; announceDates: unknown; notes: unknown }>("season", {
    fields: ["ticker", "sector", "samples", "announceDates", "notes"],
  });
  const all: CollectedTicker[] = rows.map((r) => ({
    ticker: r.ticker, sector: r.sector, samples: r.samples as unknown as SamplesByQuarter, announce: r.announceDates as unknown as AnnounceByQuarter,
  }));
  const asOf = new Date().toISOString();
  let done = 0;
  const out: Record<string, unknown>[] = [];
  for (const t of all) {
    const { stats, calendar, priorScope } = finalizeTicker(t, all, asOf);
    const row = rows.find((r) => r.ticker === t.ticker)!;
    const baseNotes = ((row.notes as string[] | null) ?? []).filter((n) => !n.startsWith("Prior "));
    out.push({
      ticker: t.ticker, stats: toJson(stats), calendar: toJson(calendar), finalizedAt: new Date(),
      notes: toJson([...baseNotes, `Prior theo quý: ${QUARTERS.map((q) => `Q${q} ${priorScope[q] === "INDUSTRY" ? "cùng ngành" : priorScope[q] === "UNIVERSE" ? "cả danh mục" : "trung tính"}`).join(", ")}.`]),
    });
    done++;
  }
  await storeUpsert("season", out);
  return { finalized: done };
}

export type SeasonalityPhase = "collect" | "finalize" | null;

export async function runEarningsSeasonalityScan(params: { phase?: SeasonalityPhase; offset?: number; limit?: number } = {}): Promise<JobResult> {
  try {
    return await handle(params);
  } finally {
    await bumpCotucDataVersion(); // N2: mọi lô (kể cả lỗi giữa chừng) đều có thể đã ghi EarningsSeasonalityCache
  }
}

async function handle(params: { phase?: SeasonalityPhase; offset?: number; limit?: number }): Promise<JobResult> {
  try {
    const phase = params.phase ?? null;
    const offset = Number(params.offset ?? 0);
    const limit = Math.max(1, Math.min(10, Number(params.limit ?? 3)));
    if (phase === "finalize") return jobOk(await finalize());
    // Danh mục = danh mục Siêu Quét AI (~300 mã); Gateway gọi xoay vòng theo lô offset/limit rồi finalize.
    const universe = await getCotucUniverse();
    const all = universe.tickers.map((t) => t.ticker);
    const tickers = all.slice(offset, offset + limit);
    const collected = await collect(tickers, new Map(universe.tickers.map((t) => [t.ticker, t])));
    const nextOffset = offset + limit >= all.length ? 0 : offset + limit;
    if (phase === "collect") return jobOk({ collected, offset, limit, nextOffset, totalTickers: all.length, universeSource: universe.source });
    return jobOk({ collected, ...(await finalize()) });
  } catch (e) {
    return jobFail({ error: e instanceof Error ? e.message : String(e) });
  }
}
