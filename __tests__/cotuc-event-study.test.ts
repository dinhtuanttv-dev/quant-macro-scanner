// CH0 — nghiên cứu sự kiện cho chart mô phỏng: ĐỐI SOÁT với engine v3 (mô phỏng vào/thoát trên đúng cửa sổ v3 phải ra đúng số v3),
// prior theo cửa sổ, lắp ráp hợp đồng.
import { describe, expect, it } from "vitest";
import { buildCycleStatsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";
import { buildRequiredOffsets } from "@/lib/cotuc/timing-v3/candidate-windows";
import { assembleEventStudy, netForEvent, windowPriors } from "@/lib/cotuc/timing-v3/event-study";
import { mulberry32 } from "@/lib/cotuc/timing-v3/compute-cycle-stats";

const offsets = buildRequiredOffsets();
function fakeCtx(n: number, seed = 7) {
  const rng = mulberry32(seed);
  const eventPaths = Array.from({ length: n }, (_, k) => {
    let c = 0;
    const car = offsets.map((o, i) => { if (i === 0) return 0; c += (rng() - 0.45) * 0.03; return k === 2 && o === 35 ? null : c; });
    return { exDate: `${2015 + k}-06-15`, car };
  });
  return { ticker: "TST", cyclePaths: { offsets, eventPaths } } as unknown as Parameters<typeof buildCycleStatsV3>[0];
}

describe("CH0 event-study — đối soát engine v3", () => {
  it("mọi cửa sổ v3: wins/losses/winRate/meanCarRaw tính lại từ đường CAR qua netForEvent khớp tuyệt đối", () => {
    const ctx = fakeCtx(10);
    const stats = buildCycleStatsV3(ctx);
    const paths = (ctx as unknown as { cyclePaths: { eventPaths: { car: (number | null)[] }[] } }).cyclePaths.eventPaths;
    for (const w of stats.windows) {
      const nets = paths.map((p) => netForEvent(p.car, offsets, w.entryTo, w.exitOffset)).filter((x): x is number => x != null);
      expect(nets.length).toBe(w.nEvents);
      expect(nets.filter((x) => x > 0).length).toBe(w.wins);
      expect(w.wins! + w.losses!).toBe(w.nEvents);
      expect(nets.filter((x) => x > 0).length / nets.length).toBeCloseTo(w.winRate, 12);
      const raw = paths.map((p) => { const a = p.car[offsets.indexOf(w.entryTo)], b = p.car[offsets.indexOf(w.exitOffset)]; return a == null || b == null ? null : b - a; }).filter((x): x is number => x != null);
      expect(raw.reduce((s, x) => s + x, 0) / raw.length).toBeCloseTo(w.meanCarRaw, 12);
    }
  });

  it("thiếu CAR ở offset -> null (đợt bị bỏ, như v3)", () => {
    expect(netForEvent([0, null], [0, 5], 0, 5)).toBeNull();
    expect(netForEvent([0, 0], [0, 5], 0, 5)).toBeCloseTo(-0.0045, 12); // phí 0,2% + 0,15% + thuế 0,1%
  });

  it("prior theo cửa sổ: ≥ 5 mã khác có ≥ 3 đợt -> mô-men (≤ 10); thiếu -> Beta(1,1)", () => {
    const rates = Array.from({ length: 6 }, (_, i) => ({ id: "w1", nEvents: 8, winRate: 0.4 + i * 0.05 })).concat([{ id: "w2", nEvents: 2, winRate: 0.9 }]);
    const p = windowPriors(["w1", "w2"], rates);
    expect(p.w1.scope).toBe("UNIVERSE_LOO");
    expect(p.w1.alpha0 + p.w1.beta0).toBeLessThanOrEqual(10 + 1e-9);
    expect(p.w2).toEqual({ alpha0: 1, beta0: 1, peers: 0, scope: "UNIFORM" });
  });

  it("lắp ráp: hợp đồng đủ trường, phí khứ hồi 0,45%", () => {
    const ctx = fakeCtx(4);
    const stats = buildCycleStatsV3(ctx);
    const es = assembleEventStudy({ ticker: "TST", kind: "DIVIDEND", quarter: null, version: stats.version, asOf: stats.asOf, offsets,
      eventPaths: (ctx as unknown as { cyclePaths: { eventPaths: { exDate: string; car: (number | null)[] }[] } }).cyclePaths.eventPaths,
      windows: stats.windows, selectedWindowId: stats.selectedWindowId, otherRates: [], upcoming: { date: "2026-11-20", status: "ESTIMATED", label: null, source: "DERIVED" } });
    expect(es.events).toHaveLength(4);
    expect(es.events[0].year).toBe(2015);
    expect(es.costPerRoundTrip).toBeCloseTo(0.0045, 12);
    expect(Object.keys(es.priors)).toEqual(stats.windows.map((w) => w.id));
    expect(es.upcoming?.status).toBe("ESTIMATED");
  });
});
