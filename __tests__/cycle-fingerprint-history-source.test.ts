// CF1 — nguồn lịch sử của Cycle Fingerprint: Ngày = Gateway ADJUSTED_CUMULATIVE; Tuần/Tháng = Yahoo adjclose, bỏ phiên khối lượng 0.
import { describe, expect, it } from "vitest";
import { fetchCycleHistory } from "@/lib/cycle-fingerprint/history-source";

const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2022, 0, 3) + i * 864e5).toISOString().slice(0, 10));
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body }) as unknown as Response;

function yahooBody(n: number) {
  const ts = days(n).map((d) => Date.parse(d) / 1000);
  return { chart: { result: [{ timestamp: ts, indicators: {
    quote: [{ open: ts.map(() => 100), high: ts.map(() => 102), low: ts.map(() => 98), close: ts.map(() => 100), volume: ts.map((_, i) => (i % 10 === 0 ? 0 : 1000)) }],
    adjclose: [{ adjclose: ts.map(() => 80) }],
  } }] } };
}

describe("fetchCycleHistory (CF1)", () => {
  it("khung ngày lấy Gateway ta-series (ADJUSTED_CUMULATIVE), bỏ nến partial", async () => {
    const calls: string[] = [];
    const bars = days(300).map((date, i) => ({ date, open: 10, high: 11, low: 9, close: 10 + i * 0.01, volume: 5, partial: i === 299 }));
    const h = await fetchCycleHistory("NT2", "daily", (async (url: string) => { calls.push(url); return json({ priceBasis: "ADJUSTED_CUMULATIVE", bars }); }) as typeof fetch);
    expect(calls[0]).toContain("/api/market/ta-series?ticker=NT2");
    expect(h.provider).toBe("GATEWAY_TA_SERIES");
    expect(h.priceBasis).toBe("ADJUSTED_CUMULATIVE");
    expect(h.bars).toHaveLength(299);
  });

  it("khung tuần dùng Yahoo adjclose: OHLC nhân hệ số adjclose/close, bỏ phiên khối lượng 0", async () => {
    const urls: string[] = [];
    const h = await fetchCycleHistory("NT2", "weekly", (async (url: string) => { urls.push(url); return json(yahooBody(300)); }) as typeof fetch);
    expect(urls[0]).toContain("period1=0&period2="); // không dùng range=max (Yahoo trả nến tháng)
    expect(urls[0]).not.toContain("range=");
    expect(h.provider).toBe("YAHOO_ADJCLOSE");
    expect(h.bars).toHaveLength(270);
    expect(h.bars[0].close).toBeCloseTo(80);
    expect(h.bars[0].high).toBeCloseTo(81.6);
    expect(h.bars.every((b) => b.volume > 0)).toBe(true);
  });

  it("Gateway lỗi -> rơi về Yahoo adjclose, ghi lý do", async () => {
    const h = await fetchCycleHistory("NT2", "daily", (async (url: string) => (url.includes("ta-series") ? json({}, false) : json(yahooBody(300)))) as typeof fetch);
    expect(h.provider).toBe("YAHOO_ADJCLOSE");
    expect(h.fallbackReason).toContain("Gateway");
  });
});
