import { describe, expect, it } from "vitest";
import { fuseSectorSignals } from "@/lib/locnganh/sector-regime-fusion";
import { computeSectorDecisionState } from "@/lib/locnganh/compute-sector-decision-state";
import { ICB_TO_WORLD_SECTOR, WORLD_SIGNAL_WEIGHT, worldContextFor, type WorldSectorSignalsDoc } from "@/lib/locnganh/world-context";

// VN-Index đi lên đều -> chế độ xu hướng ổn định (không RISK_OFF)
const closes = Array.from({ length: 260 }, (_, i) => 1000 + i * 2 + (i % 5));
const base = { reactionProbability: 0.62, reactionProbabilityNEvents: 12, confluence: { confluenceScore: 64 } as never, macroRegime: "TRUNG_LAP" as const, vnIndexCloses: closes };
const plan = { tranches: [], runTooFar: { percentile: 0.3, hasRunTooFar: false }, invalidationLevel: null, invalidated: false, timeStopped: false, pauseFurtherEntries: false } as never;

const doc = (usable: boolean, probability: number | null): WorldSectorSignalsDoc => ({
  mode: "real", asOf: "2026-10-16", lastPeriod: "2026-09",
  sectors: [{ sector: "S_BANK", nameVi: "Ngân hàng", tierA: usable ? ["FED"] : [], usable, probability, reason: usable ? "Điểm 0,40; đúng hướng ngoài mẫu 64%" : "Cổng kiểm định ngoài mẫu CHƯA đạt" }],
});

describe("Lọc ngành × Kết nối thế giới — bất biến an toàn của gói (giai đoạn 6)", () => {
  it("cổng ngoài mẫu CHƯA đạt / mô phỏng / không lấy được -> xác suất tổng hợp GIỐNG HỆT khi không có tín hiệu", () => {
    const without = fuseSectorSignals(base);
    for (const w of [worldContextFor("8300", doc(false, null)), worldContextFor("8300", { mode: "synthetic", sectors: [] }), worldContextFor("8300", null)]) {
      expect(w).not.toBeNull();
      const withW = fuseSectorSignals({ ...base, world: { usable: w!.usable, probability: w!.probability } });
      expect(withW.combined).toEqual(without.combined);
    }
    // usable nhưng xác suất không hợp lệ -> bị chặn phòng thủ
    expect(worldContextFor("8300", doc(true, 1.2))?.usable).toBe(false);
  });

  it("cổng đạt -> tham gia log-odds với trọng số thấp, dịch xác suất theo đúng chiều", () => {
    const without = fuseSectorSignals(base).combined;
    const up = fuseSectorSignals({ ...base, world: { usable: true, probability: 0.64 } }).combined;
    const down = fuseSectorSignals({ ...base, world: { usable: true, probability: 0.36 } }).combined;
    const c = up.contributions.find((x) => x.name.startsWith("Bối cảnh thế giới"));
    expect(c?.weight).toBeGreaterThan(0);
    expect(c!.weight).toBeLessThanOrEqual(WORLD_SIGNAL_WEIGHT * 1.5);
    expect(up.probability).toBeGreaterThan(without.probability);
    expect(down.probability).toBeLessThan(without.probability);
    expect(Math.abs(up.probability - without.probability)).toBeLessThan(0.08); // tín hiệu bổ sung, không lấn át
  });

  it("dòng kiểm tra 'Bối cảnh thế giới' chỉ mang tính thông tin: không bao giờ chặn FAVORABLE", () => {
    const input = {
      action: "IN_WINDOW" as const, combined: fuseSectorSignals(base).combined, entryPlan: plan, marketRegime: "NEUTRAL" as const,
      transitionDateConfirmed: true, confluenceCorroborates: true, liquidityOk: null,
    };
    const plain = computeSectorDecisionState(input);
    const unusable = computeSectorDecisionState({ ...input, world: { usable: false, probability: null, reason: "Cổng CHƯA đạt", tierA: [] } });
    expect(unusable.level).toBe(plain.level);
    expect(unusable.combinedProbability).toBe(plain.combinedProbability);
    const row = unusable.checks.find((c) => c.key === "worldContext");
    expect(row).toMatchObject({ passed: null });
    expect(row?.detail).toMatch(/Chưa dùng trong quyết định/);
    const adverse = computeSectorDecisionState({ ...input, world: { usable: true, probability: 0.36, reason: "x", tierA: ["FED"] } });
    expect(adverse.checks.find((c) => c.key === "worldContext")?.passed).toBe(null);
    expect(adverse.level).toBe(plain.level);
    expect(computeSectorDecisionState(input).checks.some((c) => c.key === "worldContext")).toBe(false);
  });

  it("ánh xạ ICB -> rổ thế giới chỉ khi khớp sát; ngành không ánh xạ -> không có tín hiệu", () => {
    expect(ICB_TO_WORLD_SECTOR["8300"]).toBe("S_BANK");
    expect(ICB_TO_WORLD_SECTOR["8700"]).toBe("S_SEC");
    expect(worldContextFor("3500", doc(true, 0.6))).toBeNull(); // Thực phẩm & Đồ uống ≠ Thuỷ sản
    expect(worldContextFor("8300", doc(true, 0.64))).toMatchObject({ usable: true, probability: 0.64, tierA: ["FED"] });
  });
});
