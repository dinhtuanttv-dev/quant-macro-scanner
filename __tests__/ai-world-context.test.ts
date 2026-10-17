import { describe, expect, it } from "vitest";
import { buildWorldAiContext } from "@/lib/ai/world-context";
import { verifySectorImpacts } from "@/lib/ai/verify-sector-impacts";

const docs = {
  pulse: { macro: { quotes: { dxy: { value: 101.8, changePct: -0.2, date: "2026-10-16", symbol: "DX-Y.NYB", nameVi: "DXY" } } }, markets: [{ symbol: "^GSPC", name: "S&P 500 (Mỹ)", value: 6000, change_percent: 0.33, date: "2026-10-16" }] },
  commodities: { items: [{ id: "BRENT", nameVi: "Dầu Brent", unit: "USD/thùng", available: true, value: 106, period: "2026-10-16", change: { pct: 0.3, basisVi: "so với phiên trước" } }, { id: "BDI", available: false }] },
  scores: {
    evidence: { reasonVi: "WS-v1" },
    rows: [
      { icb: "0500", nameVi: "Dầu khí", available: true, vnLast: "2026-10-16", short: { score: 1.1, label: "tailwind", sectors: { byRegion: { US: { z: 1.48 } } }, commodity: 0.2, evidence: { label: "EVIDENCE" } }, medium: { score: 0.6, label: "tailwind" } },
      { icb: "9500", nameVi: "Công nghệ", available: true, vnLast: "2026-10-16", short: { score: -1.26, label: "headwind", sectors: { byRegion: { US: { z: -1.3 } } }, evidence: { label: "EXPERIMENTAL" } }, medium: { score: 0.1, label: "neutral" } },
      { icb: "8300", nameVi: "Ngân hàng", available: true, vnLast: "2026-10-16", short: { score: 0.2, label: "neutral", sectors: { byRegion: {} }, evidence: { label: "EXPERIMENTAL" } }, medium: { score: 0, label: "neutral" } },
    ],
  },
  rrg: { sectors: [{ code: "0500", constituents: [{ ticker: "PVS", weight: 0.24 }, { ticker: "BSR", weight: 0.25 }] }] },
};

describe("Phân tích AI × Gateway (2026-10-17)", () => {
  it("dựng data point có ID ổn định + ngày, bảng ngành có thành phần thật theo tỷ trọng", () => {
    const c = buildWorldAiContext(docs, "2026-10-17T00:00:00Z");
    expect(c.ok).toBe(true);
    const ids = c.dataPoints.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["mc:dxy", "mk:^GSPC", "cm:BRENT", "ws:0500", "ws:9500"]));
    expect(ids).not.toContain("cm:BDI");
    expect(c.dataPoints.find((d) => d.id === "ws:0500")!.value).toContain("thuận gió");
    expect(c.sectors.get("0500")!.constituents).toEqual(["BSR", "PVS"]);
    expect(buildWorldAiContext({ pulse: null, commodities: null, scores: null, rrg: null }, "x").ok).toBe(false);
  });

  it("kiểm chứng bằng code: mã ICB hợp lệ, trích dẫn thật, không trái chiều điểm định lượng; không bao giờ nâng confidence", () => {
    const c = buildWorldAiContext(docs, "2026-10-17T00:00:00Z");
    const out = verifySectorImpacts([
      { sectorKey: "0500", direction: "bullish", confidence: 0.7, reasoningVi: "Dầu tăng", evidenceRefs: ["ws:0500", "cm:BRENT"] },
      { sectorKey: "ICB:9500", direction: "bullish", confidence: 0.8, reasoningVi: "x", evidenceRefs: ["ws:9500"] }, // trái chiều (ngược gió)
      { sectorKey: "8300", direction: "bullish", confidence: 0.6, reasoningVi: "x", evidenceRefs: ["fake:1"] }, // ref bịa
      { sectorKey: "BANKING_FINANCE", direction: "bullish", confidence: 0.9, reasoningVi: "x", evidenceRefs: ["ws:8300"] }, // khoá cũ -> bỏ
    ], c.dataPoints, c.sectors, new Map([["0500", { verified: true, finalConfidence: 0.65, discrepancies: [] }]]));
    expect(out.map((o) => o.sectorKey)).toEqual(["0500", "9500", "8300"]);
    expect(out[0]).toMatchObject({ verified: true, confidence: 0.65, vnTickers: ["BSR", "PVS"], sectorNameVi: "Dầu khí" });
    expect(out[1].verified).toBe(false);
    expect(out[1].confidence).toBeLessThanOrEqual(0.3);
    expect(out[1].discrepancies.join(" ")).toMatch(/Trái chiều/);
    expect(out[2].verified).toBe(false);
    expect(out[2].evidenceRefs).toEqual([]);
    expect(out[2].discrepancies.join(" ")).toMatch(/không tồn tại/);
  });
});

describe("chiến lược trong ngữ cảnh AI", () => {
  it("thêm st:<ICB> với α, P, tư thế và bối cảnh trung hạn; regime khi căng thẳng", () => {
    const c = buildWorldAiContext({ ...docs, strategy: { vnLast: "2026-10-16", regime: { stressed: true, noteVi: "VIX cao", date: "2026-10-16" }, short: { rows: [{ icb: "0500", nameVi: "Dầu khí", alphaBps: 22.6, pOutperform: 0.536, stance: "overweight", ic: 0.101 }, { icb: "9999", nameVi: "x", alphaBps: 1, pOutperform: 0.5, stance: "neutral", ic: 0.02 }] }, medium: [{ icb: "0500", stance: "supportive" }] } }, "2026-10-17T00:00:00Z");
    const st = c.dataPoints.find((d) => d.id === "st:0500")!;
    expect(st.value).toContain("+22.6");
    expect(st.value).toContain("ưu tiên");
    expect(st.value).toContain("bối cảnh thuận");
    expect(c.dataPoints.some((d) => d.id === "st:9999")).toBe(false); // ngành không có trong bảng ngành
    expect(c.dataPoints.some((d) => d.id === "st:regime")).toBe(true);
  });
});
