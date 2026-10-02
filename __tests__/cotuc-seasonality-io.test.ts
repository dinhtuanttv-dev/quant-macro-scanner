import { describe, expect, it } from "vitest";
import {
  buildPriors, buildSeasonalitySamples, finalizeTicker, pickAnnounceDates, type CollectedTicker,
} from "@/lib/cotuc/timing-v3/seasonality/seasonality-io";
import { EARNINGS_CANDIDATE_WINDOWS, buildEarningsOffsets } from "@/lib/cotuc/timing-v3/seasonality/earnings-windows";

// Phiên giao dịch giả lập: mọi ngày làm việc từ 2021-01-04.
function businessDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2021, 0, 4));
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const DAYS = businessDays(1300);

/** Cổ phiếu tăng 4% trong 3 phiên sau mỗi ngày công bố Q2; chỉ số đứng yên -> CAR dương rõ ở cửa sổ nắm qua công bố. */
function world(announceQ2: string[]) {
  const bench = DAYS.map((date) => ({ date, adjClose: 1000 }));
  const idx = new Map(DAYS.map((d, i) => [d, i]));
  const jumps = new Set(announceQ2.flatMap((a) => [1, 2, 3].map((k) => DAYS[idx.get(a)! + k])));
  let p = 100;
  const stock = DAYS.map((date) => { if (jumps.has(date)) p *= 1.0133; return { date, adjClose: p }; });
  return { bench, stock };
}

describe("Mùa vụ KQKD — lớp nối dữ liệu", () => {
  it("chọn 1 ngày công bố mỗi (năm, quý): ưu tiên hợp nhất, bỏ bản ghi sai định dạng", () => {
    const a = pickAnnounceDates([
      { year: 2024, quarter: 2, isParentOnly: true, announceDate: "2024-07-20" },
      { year: 2024, quarter: 2, isParentOnly: false, announceDate: "2024-07-29" },
      { year: 2025, quarter: 2, isParentOnly: true, announceDate: "2025-07-18" },
      { year: 2025, quarter: 5, isParentOnly: false, announceDate: "2025-07-18" },
      { year: 2023, quarter: 1, isParentOnly: false, announceDate: "20/04/2023" },
    ]);
    expect(a["2"]).toEqual(["2024-07-29", "2025-07-18"]);
    expect(a["1"]).toEqual([]);
  });

  it("CAR quanh ngày công bố -> mẫu theo 4 cửa sổ; cửa sổ nắm qua công bố bắt được phản ứng +4%", () => {
    const ann = { 1: [], 2: [DAYS[150], DAYS[400], DAYS[650], DAYS[900], DAYS[1150]], 3: [], 4: [] };
    const { bench, stock } = world(ann[2]);
    const r = buildSeasonalitySamples("TST", stock, bench, ann, "2026-10-03");
    expect(Object.keys(r.samples["2"]).sort()).toEqual(EARNINGS_CANDIDATE_WINDOWS.map((w) => w.id).sort());
    const e2 = r.samples["2"].e2; // vào −2, thoát +3: gồm trọn 3 phiên tăng
    expect(e2).toHaveLength(5);
    for (const s of e2) expect(Math.exp(s.carAtExit - s.carAtEntry) - 1).toBeCloseTo(1.0133 ** 3 - 1, 6);
    const e1 = r.samples["2"].e1; // −10 -> −1: trước công bố, không có phản ứng
    for (const s of e1) expect(Math.abs(s.carAtExit - s.carAtEntry)).toBeLessThan(1e-9);
    expect(r.paths["2"].eventPaths ?? (r.paths["2"] as unknown as { eventPaths: unknown[] }).eventPaths).toBeDefined();
    expect(r.samples["1"].e1).toEqual([]);
    expect(buildEarningsOffsets()[0]).toBe(-15);
  });

  it("prior: đủ 3 mã cùng ngành -> INDUSTRY; thiếu -> cả danh mục; thống kê cả năm + lịch công bố đúng hợp đồng", () => {
    const ann = { 1: [], 2: [DAYS[150], DAYS[400], DAYS[650], DAYS[900], DAYS[1150]], 3: [], 4: [] };
    const { bench, stock } = world(ann[2]);
    const mk = (ticker: string, sector: string): CollectedTicker => ({ ticker, sector, announce: ann, samples: buildSeasonalitySamples(ticker, stock, bench, ann, "x").samples });
    const all = [mk("AAA", "Ngân hàng"), mk("BBB", "Ngân hàng"), mk("CCC", "Ngân hàng"), mk("DDD", "Ngân hàng"), mk("EEE", "Thép")];
    expect(buildPriors(all[0], all)[2].scope).toBe("INDUSTRY");
    expect(buildPriors(all[4], all)[2].scope).toBe("UNIVERSE");
    expect(buildPriors(all[0], all)[1].scope).toBe("NONE");
    const f = finalizeTicker(all[0], all, "2026-10-03T00:00:00Z");
    expect(f.stats[2].eventType).toBe("EARNINGS");
    expect(f.stats[2].quarter).toBe(2);
    expect(f.stats[2].windows.map((w) => w.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(f.stats[1].selectedWindowId).toBeNull();
    expect(f.calendar.ticker).toBe("AAA");
    expect(f.calendar.quarters.map((q) => q.quarter)).toEqual([1, 2, 3, 4]);
    const q2 = f.calendar.quarters.find((q) => q.quarter === 2)!;
    expect(q2.nEvents).toBeGreaterThan(0);
  });
});
