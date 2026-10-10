// Lọc ngành (L2) — bộ nhớ đệm 30 phút cho engine xoay vòng ngành: một lần tính phục vụ cả bulk lẫn chi tiết từng ngành.
// Không ghi DB.
import { computeSectorTiming, SECTOR_TIMING_VERSION, SECTOR_WINDOWS } from "./sector-timing";
import { loadSectorTimingInput } from "./sector-io";

const TTL_MS = 30 * 60_000;

async function build() {
  const ctx = await loadSectorTimingInput();
  const r = computeSectorTiming(ctx);
  return {
    version: SECTOR_TIMING_VERSION,
    asOf: ctx.asOf,
    gateway: { engine: ctx.engine, dataAsOf: ctx.gatewayAsOf, closedThrough: ctx.closedThrough, method: ctx.method, coverage: ctx.coverage },
    market: { riskOnScore: ctx.riskOnScore, macroRegime: ctx.macroRegime },
    windows: SECTOR_WINDOWS,
    evidence: { label: "EXPERIMENTAL", reason: "Chưa kiểm định ngoài mẫu (bước L3) — xác suất và cửa sổ chỉ để tham khảo, không phải khuyến nghị." },
    signals: r.signals,
    opportunities: r.opportunities,
    details: r.details,
    generatedAt: new Date().toISOString(),
  };
}

type SectorTiming = Awaited<ReturnType<typeof build>>;
let cache: { at: number; value: SectorTiming } | null = null;
let inflight: Promise<SectorTiming> | null = null;

export async function getSectorTiming(force = false): Promise<SectorTiming> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= build()
    .then((value) => { cache = { at: Date.now(), value }; return value; })
    .finally(() => { inflight = null; });
  return inflight;
}
