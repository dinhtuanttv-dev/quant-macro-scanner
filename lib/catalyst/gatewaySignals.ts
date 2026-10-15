// lib/catalyst/gatewaySignals.ts — đầu vào thị trường cho Catalyst Engine từ Market Gateway (X1, 2026-10-16).
// Thay Yahoo (giá danh nghĩa, ^VNINDEX.VN chỉ trả 1 nến -> RS null ở mọi mã) bằng MỘT lần gọi
// GET /api/market/top20/inputs: ~276 mã của universe Siêu Quét, giá ĐIỀU CHỈNH theo sự kiện quyền.
//   rs3m              lợi suất 63 phiên của mã − của VN-Index (%)
//   volumeSpikeRatio  (GTGD TB20 / TB250 của mã) ÷ trung vị cùng tỷ lệ của universe thanh khoản
//   avgValue60        GTGD bình quân 60 phiên (VND) -> liquidityScore = hạng phân vị trong universe (dữ liệu THẬT)
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export interface GatewayTickerInput {
  ticker: string;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
  avgValue60: number | null;
  liquid: boolean;
  stale: boolean;
  lastDate: string | null;
}

export interface GatewaySignalInputs {
  ok: boolean;
  dataAsOf: string | null;
  tickers: Map<string, GatewayTickerInput>;
  /** hạng phân vị GTGD 60 phiên (0..1) trong universe */
  liquidityRank: Map<string, number>;
  error?: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseGatewayInputs(body: unknown): GatewaySignalInputs {
  const b = (body ?? {}) as { tickers?: unknown; dataAsOf?: unknown };
  const rows = Array.isArray(b.tickers) ? b.tickers : [];
  const tickers = new Map<string, GatewayTickerInput>();
  for (const r of rows as Record<string, unknown>[]) {
    if (typeof r?.ticker !== "string") continue;
    tickers.set(r.ticker, {
      ticker: r.ticker,
      rs3m: num(r.rs3m),
      volumeSpikeRatio: num(r.volumeSpikeRatio),
      avgValue60: num(r.avgValue60),
      liquid: r.liquid === true,
      stale: r.stale === true,
      lastDate: typeof r.lastDate === "string" ? r.lastDate : null,
    });
  }
  const withValue = [...tickers.values()].filter((t) => t.avgValue60 != null && t.avgValue60 > 0).sort((a, b) => a.avgValue60! - b.avgValue60!);
  const liquidityRank = new Map<string, number>();
  withValue.forEach((t, i) => liquidityRank.set(t.ticker, withValue.length > 1 ? Math.round((i / (withValue.length - 1)) * 1000) / 1000 : 0.5));
  return { ok: tickers.size > 0, dataAsOf: typeof b.dataAsOf === "string" ? b.dataAsOf : null, tickers, liquidityRank, error: tickers.size ? undefined : "Gateway trả danh sách rỗng" };
}

export async function fetchGatewaySignalInputs({ fetchImpl = fetch, timeoutMs = 45_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<GatewaySignalInputs> {
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/top20/inputs`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, dataAsOf: null, tickers: new Map(), liquidityRank: new Map(), error: `Gateway HTTP ${res.status}` };
    return parseGatewayInputs(await res.json());
  } catch (e) {
    return { ok: false, dataAsOf: null, tickers: new Map(), liquidityRank: new Map(), error: e instanceof Error ? e.message : String(e) };
  }
}
