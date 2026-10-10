// Lọc ngành (L2) — điều phối engine xoay vòng ngành: hành động theo số phiên, độ tin cậy, gom Confluence theo ngành,
// chạy trọn vòng trên dữ liệu giả lập (mọi ngành có tín hiệu + chi tiết, không nhìn trước, prior liên ngành leave-one-out).
import { describe, expect, it } from "vitest";
import { actionFor, computeSectorTiming, confidenceOf, sessionsBetween, type GatewaySectorHistory, type GatewaySectorSummary } from "@/lib/locnganh/sector-timing";
import { groupConfluence, macroRegimeOf } from "@/lib/locnganh/sector-io";
import { makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";
import type { Quadrant } from "@/lib/locnganh/sector-types";

const cal = makeVnTradingCalendar(null);
const DATES = (() => {
  const out: string[] = []; const d = new Date(Date.UTC(2022, 0, 3));
  while (out.length < 900) { const day = Math.floor(d.getTime() / 86_400_000); if (cal.isTradingDay(day)) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
})();
const bench = DATES.map((date, i) => ({ date, adjClose: 1000 * (1 + 0.0002 * i) }));

/** Ngành giả lập: chỉ số theo ngày + RRG tuần với chu kỳ góc phần tư đều đặn; `edge` = lợi suất vượt trội sau mỗi lần vào Improving. */
function sector(code: string, edge: number, phase = 0): { s: GatewaySectorSummary; h: GatewaySectorHistory } {
  const Q: Quadrant[] = ["LAGGING", "IMPROVING", "LEADING", "WEAKENING"];
  const weeks: GatewaySectorHistory["rrg"] = [];
  for (let i = 4; i < DATES.length; i += 5) {
    const k = Math.floor((i / 5 + phase) / 6) % 4;
    weeks.push({ week: DATES[i], date: DATES[i], ratio: k === 2 || k === 3 ? 101 : 99, momentum: k === 1 || k === 2 ? 101 : 99, quadrant: Q[k] });
  }
  const into = new Set(weeks.filter((w, j) => j && w.quadrant === "IMPROVING" && weeks[j - 1].quadrant !== "IMPROVING").map((w) => w.date));
  let lvl = 100, boost = 0; const index: [string, number, number][] = [];
  DATES.forEach((d, i) => { if (into.has(d)) boost = 20; const r = 0.0002 + (boost > 0 ? edge / 20 : 0); if (boost > 0) boost--; lvl *= 1 + r; index.push([d, lvl, 5]); void i; });
  return { s: { code, level: 2, name: `Ngành ${code}`, parent: "8000", quadrant: weeks.at(-1)!.quadrant, liveQuadrant: weeks.at(-1)!.quadrant, indexMembers: 5 }, h: { code, level: 2, name: `Ngành ${code}`, rrg: weeks, index } };
}

describe("engine xoay vòng ngành — điều phối", () => {
  it("hành động theo số phiên kể từ lần chuyển vào Improving", () => {
    const w = { entryFrom: 1, entryTo: 5, exitOffset: 20 };
    expect(actionFor(null, w, true)).toBe("NO_DATE");
    expect(actionFor(3, null, false)).toBe("NO_SIGNAL");
    expect(actionFor(0, w, true)).toBe("TOO_EARLY");
    expect(actionFor(3, w, true)).toBe("IN_WINDOW");
    expect(actionFor(10, w, true)).toBe("WINDOW_PASSED");
    expect(actionFor(25, w, true)).toBe("POST_EX");
    expect(sessionsBetween(["2026-10-05", "2026-10-06", "2026-10-07"], "2026-10-05", "2026-10-07")).toBe(2);
  });

  it("độ tin cậy theo q-value FDR và số sự kiện; chế độ macro theo ngưỡng Risk-On của tab", () => {
    expect(confidenceOf(0.01, 20)).toBe("HIGH");
    expect(confidenceOf(0.08, 9)).toBe("MEDIUM");
    expect(confidenceOf(0.3, 30)).toBe("LOW");
    expect(confidenceOf(null, null)).toBeNull();
    expect([macroRegimeOf(70), macroRegimeOf(30), macroRegimeOf(50), macroRegimeOf(null)]).toEqual(["RISK_ON", "RISK_OFF", "TRUNG_LAP", "TRUNG_LAP"]);
  });

  it("gom Confluence Score Top 20 theo ngành ICB cấp 2 và 3", () => {
    const m = groupConfluence([{ ticker: "VCB", confluenceScore: 80 }, { ticker: "TCB", confluenceScore: 60 }, { ticker: "SSI", confluenceScore: 40 }],
      { VCB: { l2: "8300", l3: "8350" }, TCB: { l2: "8300", l3: "8350" }, SSI: { l2: "8700" } });
    expect(m.get("8300")).toBe(70); expect(m.get("8350")).toBe(70); expect(m.get("8700")).toBe(40);
  });

  it("trọn vòng: mọi ngành có tín hiệu + chi tiết; ngành có lợi thế rõ được chọn cửa sổ, ngành không lợi thế thì không", () => {
    const a = sector("8300", 0.06), b = sector("8600", -0.04, 2), c = sector("8700", 0.0, 4);
    const r = computeSectorTiming({
      summaries: [a.s, b.s, c.s], histories: new Map([[a.h.code, a.h], [b.h.code, b.h], [c.h.code, c.h]]), l1Of: new Map([["8300", "8000"], ["8600", "8000"], ["8700", "8000"]]),
      bench, closedThrough: null, asOf: DATES.at(-1)!, macroRegime: "TRUNG_LAP", cal,
    });
    expect(r.signals.map((x) => x.sectorKey)).toEqual(["8300", "8600", "8700"]);
    for (const x of r.signals) { expect(r.details.get(x.sectorKey)?.paths.offsets.length).toBe(71); expect(["FAVORABLE", "WATCH", "AVOID"]).toContain(x.decision.level); }
    const good = r.signals[0], bad = r.signals[1];
    expect(good.nEvents).toBeGreaterThanOrEqual(8);
    expect(good.window).not.toBeNull();
    expect(good.expectedNetReturn!).toBeGreaterThan(0);
    // xác suất Beta-Binomial bị co về prior liên ngành (2 ngành cùng nhóm không có lợi thế) — có, nhưng không phóng đại
    expect(good.reactionProbability).not.toBeNull();
    expect(good.reactionProbability!.ci[0]).toBeLessThan(good.reactionProbability!.mean);
    expect(bad.window).toBeNull();
    expect(bad.action).toBe("NO_SIGNAL");
    expect(bad.decision.level).toBe("AVOID");
  });
});
