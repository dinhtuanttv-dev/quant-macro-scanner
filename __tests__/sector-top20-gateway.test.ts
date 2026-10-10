// Radar Top 20 (T0) — thành phần lấy từ Gateway (chuỗi điều chỉnh cộng dồn cả universe), chấm điểm giữ nguyên hợp đồng.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createServiceClient: () => { throw new Error("no db in test"); } }));
vi.mock("@/lib/market-data/yahoo-finance-adapter", () => ({ fetchOhlcvHistory: async () => ({ success: false, data: null }) }));
const { computeSectorTop20 } = await import("@/lib/sector-filter/compute-top20");

const tickers = Array.from({ length: 80 }, (_, i) => ({
  ticker: `T${String(i).padStart(2, "0")}`, rs3m: i - 40, volumeSpikeRatio: 1 + (i % 5) * 0.3, pvtScore: (i % 7) * 20 - 60, adScore: (i % 3) * 40 - 40,
  avgValue60: i === 79 ? 1e9 : 2e10, liquid: i !== 79, stale: i === 78,
}));
const json = (b: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => b }) as unknown as Response;
const fetchOk = (async (url: string) => {
  if (url.includes("/top20/inputs")) return json({ engine: "top20/T0", dataAsOf: "2026-10-09", priceBasis: "ADJUSTED_CUMULATIVE", count: 80, liquid: 78, tickers });
  if (url.includes("/sectors/rrg")) return json({ closedThrough: "2026-10-09", sectors: [{ code: "8300", level: 2, name: "Ngân hàng", quadrant: "LEADING" }, { code: "9500", level: 2, name: "Công nghệ", quadrant: "LAGGING" }] });
  if (url.includes("/sectors/taxonomy")) return json({ symbols: Object.fromEntries(tickers.map((t, i) => [t.ticker, { l2: i % 2 ? "8300" : "9500" }])) });
  return json({}, false);
}) as typeof fetch;

describe("computeSectorTop20 (T0, Gateway)", () => {
  it("đọc thành phần Gateway: RS không còn null, bỏ mã thiếu thanh khoản / dừng giao dịch, ngành ICB làm sectorKey, giữ hợp đồng", async () => {
    const r = await computeSectorTop20(null, fetchOk);
    expect(r.dataSource?.provider).toBe("GATEWAY_TOP20_INPUTS");
    expect(r.dataSource?.priceBasis).toBe("ADJUSTED_CUMULATIVE");
    expect(r.totalAnalyzed).toBe(78);
    expect(r.top20).toHaveLength(20);
    expect(r.top20.every((x) => x.rs3m != null && x.rsScore > 0)).toBe(true);
    expect(r.top20.some((x) => x.ticker === "T79" || x.ticker === "T78")).toBe(false);
    expect(r.top20[0].icbCode && ["8300", "9500"].includes(r.top20[0].sectorKey)).toBeTruthy();
    for (const k of ["ticker", "sectorKey", "sectorQuadrant", "rrgScore", "rsScore", "volumeScore", "pvtScoreNormalized", "adScoreNormalized", "weightsUsed", "confluenceScore"]) expect(r.top20[0]).toHaveProperty(k);
    expect(r.evidence?.label).toBe("EXPERIMENTAL");
  });

  it("lọc theo mã ngành ICB", async () => {
    const r = await computeSectorTop20("8300", fetchOk);
    expect(r.top20.every((x) => x.icbCode === "8300")).toBe(true);
  });

  it("Gateway lỗi -> rơi về đường Yahoo cũ, ghi lý do", async () => {
    const r = await computeSectorTop20(null, (async (url: string) => (url.includes("/top20/inputs") ? json({}, false) : fetchOk(url))) as typeof fetch);
    expect(r.dataSource?.provider).toBe("YAHOO_LEGACY");
    expect(r.dataSource?.fallbackReason).toContain("top20/inputs");
  });
});
