// Lọc ngành (L2) — bộ nhớ đệm 30 phút cho engine xoay vòng ngành: một lần tính phục vụ cả bulk lẫn chi tiết từng ngành.
// Không ghi DB.
import { computeSectorTiming, SECTOR_TIMING_VERSION, SECTOR_WINDOWS } from "./sector-timing";
import { loadSectorTimingInput, RISK_ON_EVIDENCE, RISK_ON_IN_DECISION } from "./sector-io";

const TTL_MS = 30 * 60_000;

async function build() {
  const ctx = await loadSectorTimingInput();
  const r = computeSectorTiming(ctx);
  return {
    version: SECTOR_TIMING_VERSION,
    asOf: ctx.asOf,
    gateway: { engine: ctx.engine, dataAsOf: ctx.gatewayAsOf, closedThrough: ctx.closedThrough, method: ctx.method, coverage: ctx.coverage },
    // macroRegime = chế độ ĐÃ dùng trong quyết định (TRUNG_LAP khi Risk-On bị loại); riskOnRegime = nhãn hiển thị của điểm Risk-On
    market: { riskOnScore: ctx.riskOnScore, macroRegime: ctx.macroRegime, riskOnRegime: ctx.riskOnDisplayRegime, riskOnInDecision: RISK_ON_IN_DECISION, riskOnEvidence: RISK_ON_EVIDENCE },
    windows: SECTOR_WINDOWS,
    // L3 (Gateway sectors/validation.js): kiểm định đặt trước "ngành vào Cải thiện" — KHÔNG ĐẠT -> EXPERIMENTAL
    evidence: ctx.evidence ?? { label: "EXPERIMENTAL", reason: "Chưa có kết quả kiểm định ngoài mẫu — tham khảo, không phải khuyến nghị." },
    signals: r.signals,
    opportunities: r.opportunities,
    details: r.details,
    // cho cron theo dõi tín hiệu (không trả qua API)
    bench: ctx.bench,
    indexPrices: new Map([...ctx.histories].map(([code, h]) => [code, h.index.map(([date, close]) => ({ date, adjClose: close }))])),
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
