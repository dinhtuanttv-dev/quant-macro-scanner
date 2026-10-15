// Băng thông Supabase (10/2026): đọc GỌN CotucDecisionState (chỉ nhánh JSON cần, cắt trong Postgres) + đệm theo thời gian.
import { describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      sqls.push(sql);
      if (sql.includes("'backtest') = 'array'")) return [{ ticker: "AAA", bt: [{ id: "w1", nEvents: 5, winRate: 0.6 }] }, { ticker: "BBB", bt: null }];
      if (sql.includes("ex_status")) return [{ ticker: "AAA", ex_status: "CONFIRMED", conflict: "NONE" }];
      return [{ ticker: "AAA", computedAt: new Date("2026-10-15T00:00:00Z"), snapshot: { exDate: null, decision: { level: "WATCH" }, signals: [], backtest: [] } }];
    },
  },
}));
const { loadBacktestRates, loadDecisionFlags, loadDecisionForTimeline, memoTtl } = await import("@/lib/cotuc/decision-state-lite");

describe("decision-state-lite", () => {
  it("không SELECT nguyên cột snapshot — chỉ các nhánh JSON cần", async () => {
    const rates = await loadBacktestRates();
    expect(rates).toEqual([{ ticker: "AAA", bt: [{ id: "w1", nEvents: 5, winRate: 0.6 }] }, { ticker: "BBB", bt: [] }]);
    const flags = await loadDecisionFlags();
    expect(flags[0].snapshot.exDate?.status).toBe("CONFIRMED");
    expect(flags[0].snapshot.recommendation.earningsImpact.conflict).toBe("NONE");
    await loadDecisionForTimeline();
    for (const sql of sqls) {
      expect(sql).not.toMatch(/SELECT\s+ticker,\s*snapshot\s*(,|FROM)/i); // nguyên cột snapshot
      expect(sql).not.toMatch(/\bsnapshot\s*,\s*"computedAt"\s*FROM/i);
    }
    expect(sqls[0]).toContain("jsonb_build_object('id', w->'id', 'nEvents', w->'nEvents', 'winRate', w->'winRate')");
  });

  it("memoTtl: trong hạn trả bản đệm, hết hạn tải lại, gọi đồng thời chỉ tải một lần", async () => {
    let t = 0, loads = 0;
    const m = memoTtl(1000, async () => ++loads, () => t);
    expect(await Promise.all([m(), m()])).toEqual([1, 1]);
    t = 500; expect(await m()).toBe(1);
    t = 1500; expect(await m()).toBe(2);
    expect(await m(true)).toBe(3);
  });
});
