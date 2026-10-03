// Danh mục quét của tab Cổ tức = ĐÚNG danh mục của Siêu Quét AI (Market Gateway /api/market/scanner/universe:
// top ~300 mã theo GTGD bình quân 20 phiên ≥ 1 tỷ + nhóm mã ghim, gồm 17 mã cổ tức gốc). Gateway lỗi -> dùng 17 mã gốc.
// Thứ tự trả về ỔN ĐỊNH (17 mã cổ tức trước, rồi theo thanh khoản giảm dần) để cron chia lô offset/limit không trượt.
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export interface CotucUniverseTicker {
  ticker: string;
  exchange: string | null;
  sector: string | null;
  sectorGroup: string | null;
  name: string | null;
  avgValue20: number | null;
  /** true = thuộc 17 mã cổ tức theo dõi gốc. */
  core: boolean;
}

export interface CotucUniverse {
  tickers: CotucUniverseTicker[];
  source: "GATEWAY" | "FALLBACK_17";
  builtAt: string | null;
  error?: string;
}

interface GatewayUniverseRow { ticker?: string; exchange?: string | null; sector?: string | null; industry?: string | null; sectorGroup?: string | null; name?: string | null; avgValue20?: number | null }

/** Hàm thuần: ghép danh mục Gateway với 17 mã gốc, thứ tự ổn định. */
export function buildCotucUniverse(rows: GatewayUniverseRow[]): CotucUniverseTicker[] {
  const core = new Map(DIVIDEND_STOCKS.map((s) => [s.ticker, s]));
  const byTicker = new Map<string, GatewayUniverseRow>();
  for (const r of rows) {
    const t = r.ticker?.trim().toUpperCase();
    if (t && /^[A-Z0-9]{3,10}$/.test(t) && !byTicker.has(t)) byTicker.set(t, r);
  }
  const mk = (t: string, r: GatewayUniverseRow | undefined): CotucUniverseTicker => ({
    ticker: t, exchange: r?.exchange ?? null, sector: core.get(t)?.sector ?? r?.industry ?? r?.sector ?? null, sectorGroup: r?.sectorGroup ?? null,
    name: r?.name ?? core.get(t)?.name ?? null, avgValue20: r?.avgValue20 ?? null, core: core.has(t),
  });
  const head = DIVIDEND_STOCKS.map((s) => mk(s.ticker, byTicker.get(s.ticker)));
  const tail = [...byTicker.entries()].filter(([t]) => !core.has(t))
    .sort((a, b) => (b[1].avgValue20 ?? 0) - (a[1].avgValue20 ?? 0) || a[0].localeCompare(b[0]))
    .map(([t, r]) => mk(t, r));
  return [...head, ...tail];
}

let cache: { at: number; value: CotucUniverse } | null = null;
const TTL_MS = 30 * 60_000;

export async function getCotucUniverse({ fetchImpl = fetch, force = false }: { fetchImpl?: typeof fetch; force?: boolean } = {}): Promise<CotucUniverse> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/scanner/universe`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    const body = await res.json() as { tickers?: GatewayUniverseRow[]; builtAt?: string };
    const rows = Array.isArray(body.tickers) ? body.tickers : [];
    if (rows.length < 20) throw new Error(`Gateway trả ${rows.length} mã`);
    const value: CotucUniverse = { tickers: buildCotucUniverse(rows), source: "GATEWAY", builtAt: body.builtAt ?? null };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    const value: CotucUniverse = { tickers: buildCotucUniverse([]), source: "FALLBACK_17", builtAt: null, error: e instanceof Error ? e.message : String(e) };
    return cache?.value ?? value;
  }
}
