// Cycle Fingerprint — nguồn lịch sử giá (CF1, 2026-10-10).
//
// TRƯỚC: Yahoo `close` CHƯA điều chỉnh cổ tức (VD NT2 10/2021: 22.350 so với 16.846 đã điều chỉnh) + phiên "ma" khối lượng 0
// -> cú giảm giả quanh ngày GDKHQ làm méo cả mẫu hình lẫn R10–R60.
// NAY:
//   - Khung NGÀY: Gateway /api/market/ta-series — chuỗi ADJUSTED_CUMULATIVE (điều chỉnh lùi cộng dồn theo sự kiện quyền),
//     cùng cơ sở giá với các bộ lọc / biểu đồ khác của hệ thống.
//   - Khung TUẦN/THÁNG: cần lịch sử dài hơn ~5 năm Gateway đang có -> Yahoo `adjclose` (đã điều chỉnh), bỏ phiên khối lượng 0;
//     OHLC nhân cùng hệ số adjclose/close. Nhãn nguồn trả về để UI ghi rõ.
// Gateway lỗi -> rơi về Yahoo adjclose (không chặn tính năng), ghi lý do.
import type { OhlcvBar } from "@/lib/market-data/tcbs-adapter";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export interface CycleHistory {
  bars: OhlcvBar[];
  provider: "GATEWAY_TA_SERIES" | "YAHOO_ADJCLOSE";
  priceBasis: string;
  fallbackReason?: string;
}

type Timeframe = "daily" | "weekly" | "monthly";

async function fromGateway(ticker: string, fetchImpl: typeof fetch): Promise<CycleHistory> {
  const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/ta-series?ticker=${encodeURIComponent(ticker)}&range=5y&limit=1400`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Gateway ta-series HTTP ${res.status}`);
  const json = await res.json();
  const bars: OhlcvBar[] = (json?.bars ?? [])
    .filter((b: { partial?: boolean; close?: number }) => !b.partial && Number(b.close) > 0)
    .map((b: { date: string; open: number; high: number; low: number; close: number; volume?: number }) => ({
      date: b.date, open: b.open || b.close, high: b.high || b.close, low: b.low || b.close, close: b.close, volume: b.volume ?? 0,
    }));
  if (bars.length < 100) throw new Error(`Gateway chỉ có ${bars.length} phiên`);
  return { bars, provider: "GATEWAY_TA_SERIES", priceBasis: String(json?.priceBasis ?? "UNKNOWN") };
}

async function fromYahooAdjusted(yahooTicker: string, range: string, fetchImpl: typeof fetch): Promise<CycleHistory> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=${range}&interval=1d`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0] ?? {};
  const adj: (number | null)[] | undefined = r?.indicators?.adjclose?.[0]?.adjclose;
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i], v = q.volume?.[i];
    if (!(c > 0) || !(v > 0)) continue; // bỏ phiên thiếu giá / phiên "ma" khối lượng 0
    const k = adj?.[i] && adj[i]! > 0 ? adj[i]! / c : 1;
    bars.push({
      date: new Date((ts[i] + 7 * 3600) * 1000).toISOString().slice(0, 10),
      open: (q.open?.[i] || c) * k, high: (q.high?.[i] || c) * k, low: (q.low?.[i] || c) * k, close: c * k, volume: v,
    });
  }
  if (bars.length < 100) throw new Error(`Yahoo chỉ có ${bars.length} phiên`);
  return { bars, provider: "YAHOO_ADJCLOSE", priceBasis: adj ? "YAHOO_ADJCLOSE" : "YAHOO_CLOSE_UNADJUSTED" };
}

export async function fetchCycleHistory(rawTicker: string, timeframe: Timeframe, fetchImpl: typeof fetch = fetch): Promise<CycleHistory> {
  const ticker = rawTicker.toUpperCase().replace(/\.VN$/, "");
  if (timeframe === "daily") {
    try { return await fromGateway(ticker, fetchImpl); }
    catch (err) {
      const fb = await fromYahooAdjusted(`${ticker}.VN`, "5y", fetchImpl);
      return { ...fb, fallbackReason: `Gateway lỗi: ${String((err as Error)?.message ?? err)}` };
    }
  }
  return fromYahooAdjusted(`${ticker}.VN`, "max", fetchImpl);
}
