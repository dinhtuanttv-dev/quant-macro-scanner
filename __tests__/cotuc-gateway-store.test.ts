// B1/B2 (25/10/2026) — kho Cổ tức trên Gateway (thay Neon) + Timeline luôn có dự phòng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CotucStoreError, cotucErrorCode, storeList, storeUpsert, withDates } from "@/lib/cotuc/store/gateway-store";
import { rebaseTimeline, type TimelineRow } from "@/lib/cotuc/timing-v3/buy-timeline";
import { makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";

const cal = makeVnTradingCalendar(null);

describe("gateway-store", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.CRON_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (init.method === "POST") return new Response(JSON.stringify({ written: JSON.parse(String(init.body)).rows.length }), { status: 200 });
      if (url.includes("/bad")) return new Response(JSON.stringify({ error: "Bảng không hợp lệ" }), { status: 400 });
      return new Response(JSON.stringify({ rows: [{ ticker: "FPT", computedAt: "2026-10-24T08:00:00.000Z" }] }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("đọc: lọc mã + chiếu trường qua query, gửi Bearer CRON_SECRET; danh sách rỗng không gọi mạng", async () => {
    const rows = await storeList("decision", { tickers: ["FPT", "VNM"], fields: ["ticker", "snapshot.exDate"] });
    expect(rows).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/api\/cotuc-store\/decision\?tickers=FPT%2CVNM&fields=ticker%2Csnapshot.exDate$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer test-secret");
    expect(await storeList("decision", { tickers: [] })).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("ghi: Date -> ISO, bỏ undefined, chia lô theo dung lượng", async () => {
    const big = "x".repeat(1_500_000);
    const n = await storeUpsert("season", [1, 2, 3, 4].map((i) => ({ ticker: `T${i}`, samples: big, collectedAt: new Date("2026-10-25T00:00:00Z"), gone: undefined })));
    expect(n).toBe(4);
    expect(calls.length).toBe(2); // 4 × 1,5 MB > 4 MB / lô
    const first = JSON.parse(String(calls[0].init.body)).rows[0];
    expect(first.collectedAt).toBe("2026-10-25T00:00:00.000Z");
    expect("gone" in first).toBe(false);
  });

  it("lỗi kho -> CotucStoreError (mã STORE_UNAVAILABLE); lỗi hạn mức Postgres -> DB_QUOTA; cột thời gian về Date", async () => {
    await expect(storeList("bad" as never)).rejects.toBeInstanceOf(CotucStoreError);
    expect(cotucErrorCode(new CotucStoreError("x", 503))).toBe("STORE_UNAVAILABLE");
    expect(cotucErrorCode(new Error("Your account or project has exceeded the quota"))).toBe("DB_QUOTA");
    expect(withDates({ a: "2026-10-24T08:00:00.000Z", b: null }, ["a", "b"] as const)).toEqual({ a: new Date("2026-10-24T08:00:00.000Z"), b: null });
  });
});

describe("rebaseTimeline (bản lưu dựng lại theo hôm nay)", () => {
  const row = (id: string, from: string, to: string, exit: string, tier: "VALIDATED" | "NEAR" = "VALIDATED"): TimelineRow => ({
    id, ticker: id, sector: null, kind: "DIVIDEND", tier, status: "UPCOMING", eventLabel: "GDKHQ", eventDate: exit, eventDateBasis: "CONFIRMED",
    windowId: "w", windowLabel: "W", entryFrom: -5, entryTo: -1, exitOffset: 2, entryFromDate: from, entryToDate: to, exitDate: exit,
    sessionsToEntry: 99, nEvents: 10, winRate: 0.7, probability: null, netExpectancy: 0.02, netExpectancyLcb: 0.01, fdrQValue: 0.05, decisionLevel: null, missing: [],
  });
  it("bỏ dòng đã qua ngày thoát, tính lại trạng thái + số phiên + bộ đếm", () => {
    const body = { today: "2026-10-23", asOf: { decisions: "x", seasonality: null }, counts: { validated: 3, near: 0, inWindow: 0, upcoming: 3 },
      rows: [row("AAA", "2026-10-28", "2026-10-30", "2026-11-04"), row("BBB", "2026-10-22", "2026-10-27", "2026-10-29"), row("CCC", "2026-10-01", "2026-10-10", "2026-10-15")] };
    const out = rebaseTimeline(body, "2026-10-26", cal);
    expect(out.today).toBe("2026-10-26");
    expect(out.rows.map((r) => [r.ticker, r.status, r.sessionsToEntry])).toEqual([["BBB", "IN_WINDOW", -2], ["AAA", "UPCOMING", 2]]);
    expect(out.counts).toEqual({ validated: 2, near: 0, inWindow: 1, upcoming: 1 });
    expect(out.asOf).toBe(body.asOf);
  });
});

describe("GET /api/cotuc/buy-timeline — luôn có dự phòng", () => {
  afterEach(() => { vi.resetModules(); vi.doUnmock("@/lib/cotuc/decision-state-lite"); vi.doUnmock("@/lib/cotuc/data-version"); vi.doUnmock("@/lib/cotuc/cotuc-universe"); });

  async function load(opts: { storeFails: boolean; lastGood: unknown }) {
    const saved: unknown[] = [];
    vi.doMock("@/lib/cotuc/cotuc-universe", () => ({ getCotucUniverse: async () => ({ tickers: [{ ticker: "AAA", sector: "X" }], source: "GATEWAY" }) }));
    vi.doMock("@/lib/cotuc/decision-state-lite", () => ({
      cotucSourceStamp: async () => { if (opts.storeFails) throw new CotucStoreError("Kho Cổ tức (Gateway) không phản hồi", null); return "s1"; },
      loadDecisionForTimeline: async () => [],
      memoByStamp: <T,>(stamp: () => Promise<string>, compute: () => Promise<T>) => async () => { await stamp(); return compute(); },
    }));
    vi.doMock("@/lib/cotuc/data-version", () => ({
      readThroughByVersion: async (_n: string, f: () => Promise<unknown>) => f(),
      saveLastGood: async (_n: string, _h: string, v: unknown) => { saved.push(v); return true; },
      readLastGood: async () => opts.lastGood,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 })));
    const mod = await import("@/app/api/cotuc/buy-timeline/route");
    return { GET: mod.GET, saved };
  }

  it("kho đọc được -> LIVE, lưu bản tốt gần nhất", async () => {
    const { GET, saved } = await load({ storeFails: false, lastGood: null });
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.servedFrom).toBe("LIVE");
    expect(saved).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("kho lỗi + có bản lưu -> 200 LAST_GOOD, stale, dựng lại theo hôm nay; không có bản lưu -> 500 có mã lỗi", async () => {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const last = { hash: "h", savedAt: "2026-10-24T08:00:00Z", value: { today: "2026-10-20", asOf: { decisions: new Date().toISOString(), seasonality: null }, coverage: { decisions: 1, seasonality: 0, universe: 1 }, counts: { validated: 0, near: 0, inWindow: 0, upcoming: 0 }, rows: [] } };
    let { GET } = await load({ storeFails: true, lastGood: last });
    let res = await GET();
    let body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ servedFrom: "LAST_GOOD", stale: true, today, code: "STORE_UNAVAILABLE" });
    vi.resetModules();
    ({ GET } = await load({ storeFails: true, lastGood: null }));
    res = await GET();
    body = await res.json();
    expect(res.status).toBe(500);
    expect(body.code).toBe("STORE_UNAVAILABLE");
    vi.unstubAllGlobals();
  });

  it("bản lưu quá 10 phiên -> 503 STALE (không hiện vùng mua lỗi thời)", async () => {
    const last = { hash: "h", savedAt: "2026-09-01T08:00:00Z", value: { today: "2026-09-01", asOf: { decisions: "2026-09-01T08:00:00.000Z", seasonality: null }, coverage: { decisions: 1, seasonality: 0, universe: 1 }, counts: { validated: 0, near: 0, inWindow: 0, upcoming: 0 }, rows: [] } };
    const { GET } = await load({ storeFails: true, lastGood: last });
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("STALE");
    vi.unstubAllGlobals();
  });
});
