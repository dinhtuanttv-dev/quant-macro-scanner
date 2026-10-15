import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/catalyst/engine/SectorRegistry", () => ({ resolveSectorName: async (s: string) => ({ displayName: s, wasUnmapped: false }) }));

import { parseGatewayInputs } from "@/lib/catalyst/gatewaySignals";
import { buildMarketSignals, inferPriceInStatus, inferVolumeFlag } from "@/lib/catalyst/marketSignals";
import { directionFromImpact } from "@/lib/catalyst/newsIngestion";

const body = {
  dataAsOf: "2026-10-15",
  tickers: [
    { ticker: "AAA", rs3m: 7.3, volumeSpikeRatio: 2.17, avgValue60: 10e9, liquid: true, stale: false, lastDate: "2026-10-15" },
    { ticker: "BBB", rs3m: -2, volumeSpikeRatio: 0.8, avgValue60: 500e9, liquid: true, stale: false, lastDate: "2026-10-15" },
    { ticker: "CCC", rs3m: 20, volumeSpikeRatio: 3, avgValue60: 1e9, liquid: false, stale: true, lastDate: "2026-09-01" },
    { ticker: 5, rs3m: 1 },
  ],
};

describe("X1 — hướng tác động: tin trung lập không còn bị gán 'có lợi'", () => {
  it("rawImpact 0 (GDKHQ cổ tức tiền/cổ phiếu) -> null; dương -> benefit; âm -> harm", () => {
    expect(directionFromImpact(0)).toBeNull();
    expect(directionFromImpact(Number.NaN)).toBeNull();
    expect(directionFromImpact(3)).toBe("benefit");
    expect(directionFromImpact(-5)).toBe("harm");
  });
});

describe("X1 — đầu vào thị trường từ Gateway", () => {
  it("parse: bỏ dòng hỏng, hạng phân vị GTGD 60 phiên", () => {
    const g = parseGatewayInputs(body);
    expect(g.ok).toBe(true);
    expect(g.dataAsOf).toBe("2026-10-15");
    expect([...g.tickers.keys()]).toEqual(["AAA", "BBB", "CCC"]);
    expect(g.liquidityRank.get("CCC")).toBe(0);
    expect(g.liquidityRank.get("AAA")).toBe(0.5);
    expect(g.liquidityRank.get("BBB")).toBe(1);
    expect(parseGatewayInputs({}).ok).toBe(false);
  });

  it("buildMarketSignals: RS/dòng tiền thật; mã cũ (stale) hoặc ngoài universe -> trung lập, không bịa số", () => {
    const g = parseGatewayInputs(body);
    const m = buildMarketSignals(["AAA", "BBB", "CCC", "ZZZ"], g, new Set(["BBB"]));
    expect(m.get("AAA")).toMatchObject({ priceInStatus: "reflected", volumeFlag: "confirmed", liquidityScore: 0.5, foreignFlowDirection: "none" });
    expect(m.get("BBB")).toMatchObject({ priceInStatus: "not_reflected", volumeFlag: "none", liquidityScore: 1, foreignFlowDirection: "buy" });
    expect(m.get("CCC")).toMatchObject({ priceInStatus: "not_reflected", volumeFlag: "none" });
    expect(m.get("ZZZ")).toMatchObject({ priceInStatus: "not_reflected", volumeFlag: "none", liquidityScore: 0.5, valuationPercentile: 0.5 });
  });

  it("ngưỡng không đổi so với bản Yahoo", () => {
    expect(inferPriceInStatus(5)).toBe("not_reflected");
    expect(inferPriceInStatus(5.1)).toBe("reflected");
    expect(inferVolumeFlag(1.5)).toBe("confirmed");
    expect(inferVolumeFlag(null)).toBe("none");
  });
});
