// Lọc ngành (L5) — góc phần tư Top 20 theo ngành ICB của Gateway; sổ theo dõi tín hiệu ngành (ghi / chấm / tóm tắt).
import { describe, expect, it } from "vitest";
import { buildIcbQuadrantMap } from "@/lib/sector-filter/gateway-quadrants";
import { planSectorIssue, planSectorResolutions, sessionAfter, summarizeSectorTracking, type SectorTrackRow } from "@/lib/locnganh/tracking";
import type { SectorTimingSignalV2 } from "@/lib/locnganh/sector-timing";

describe("góc phần tư Top 20 theo ngành ICB (Gateway)", () => {
  it("mã -> ngành cấp 2 -> góc RRG (viết hoa chữ đầu như cũ); thiếu dữ liệu -> null", () => {
    const m = buildIcbQuadrantMap({ closedThrough: "2026-10-09", sectors: [{ code: "8300", level: 2, name: "Ngân hàng", quadrant: "LAGGING" }, { code: "8350", level: 3, name: "Ngân hàng", quadrant: "LEADING" }, { code: "0500", level: 2, name: "Dầu khí", quadrant: "LEADING" }] },
      { symbols: { VCB: { l2: "8300" }, GAS: { l2: "0500" } } });
    expect(m.of("VCB")).toEqual({ code: "8300", name: "Ngân hàng", quadrant: "Lagging" });
    expect(m.of("GAS")?.quadrant).toBe("Leading");
    expect(m.of("XYZ")).toBeNull();
    expect(buildIcbQuadrantMap(null, null).of("VCB")).toBeNull();
  });
});

const DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09"];
const sig = (over: Partial<SectorTimingSignalV2> = {}) => ({
  sectorKey: "8300", action: "IN_WINDOW", tdSinceTransition: 2, window: { entryFrom: 1, entryTo: 3, exitOffset: 4 }, expectedNetReturn: 0.01, nEvents: 10, fdrQValue: 0.04, confidence: "MEDIUM",
  reactionProbability: { mean: 0.6, ci: [0.4, 0.75] }, name: "Ngân hàng", level: 2, group: "8000", quadrant: "IMPROVING", liveQuadrant: "IMPROVING", indexMembers: 20, thin: false,
  lastTransitionDate: "2026-09-02", expectedNetReturnLcb: 0.002, confluenceScore: 55,
  decision: { level: "WATCH", headline: "", checks: [], combinedProbability: 0.58, disclaimer: "NOT_INVESTMENT_ADVICE" }, ...over,
}) as SectorTimingSignalV2;

describe("sổ theo dõi tín hiệu ngành", () => {
  it("chỉ ghi khi IN_WINDOW và quyết định không phải AVOID; không ghi trùng cửa sổ đang mở", () => {
    const r = planSectorIssue(sig(), "E1-3_X10", [], DATES, "2026-09-04", "2026-09-04T09:20:00Z")!;
    expect(r.id).toBe("8300:E1-3_X10:2026-09-04");
    expect(r.plannedExitDate).toBe(sessionAfter(DATES, "2026-09-02", 4));
    expect(r.plannedExitDate).toBe("2026-09-08");
    expect(planSectorIssue(sig({ action: "TOO_EARLY" }), "E1-3_X10", [], DATES, "2026-09-04", "x")).toBeNull();
    expect(planSectorIssue(sig({ decision: { ...sig().decision, level: "AVOID" } }), "E1-3_X10", [], DATES, "2026-09-04", "x")).toBeNull();
    expect(planSectorIssue(sig(), "E1-3_X10", [r], DATES, "2026-09-07", "x")).toBeNull();
  });
  it("chấm kết quả bằng CAR chỉ số ngành − VN-Index khi đã có giá tới ngày thoát; tóm tắt dùng summarizeTracking", () => {
    const row = planSectorIssue(sig(), "E1-3_X10", [], DATES, "2026-09-04", "2026-09-04T09:20:00Z") as SectorTrackRow;
    const ix = DATES.map((date, i) => ({ date, adjClose: 100 + 2 * i })), bench = DATES.map((date) => ({ date, adjClose: 1000 }));
    const res = planSectorResolutions([row], () => ix, bench);
    expect(res).toHaveLength(1); expect(res[0].outcome).toBe(1); expect(res[0].exitDate).toBe("2026-09-08");
    expect(planSectorResolutions([row], () => ix, bench.slice(0, 4))).toHaveLength(0);
    const s = summarizeSectorTracking([{ ...row, outcome: 1, realizedCar: res[0].realizedCar, exitDate: res[0].exitDate, outcomeRecordedAt: "2026-09-08T09:20:00Z" }]);
    expect(s.totalSignals).toBe(1); expect(s.resolvedSignals).toBe(1); expect(s.rollingAccuracy).toBe(1);
  });
});
