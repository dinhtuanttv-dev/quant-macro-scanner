// Lọc ngành (L5) — góc phần tư RRG của mỗi cổ phiếu = góc của NGÀNH ICB cấp 2 chứa mã (RRG tuần JdK đã lọc nhiễu, tuần đã đóng)
// do Market Gateway tính trên chỉ số ngành tổng hợp (/api/market/sectors/rrg + /taxonomy). Thay RRG cũ (Yahoo 6 tháng, 1 mã đại
// diện cho 8 ngành, benchmark ETF E1VFVN30) — đã gỡ.
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import type { RRGQuadrant } from "@/lib/sector-filter/scoring/confluence-score";

const CASE: Record<string, RRGQuadrant> = { LEADING: "Leading", IMPROVING: "Improving", WEAKENING: "Weakening", LAGGING: "Lagging" };

export interface IcbQuadrantMap {
  of(ticker: string): { code: string; name: string; quadrant: RRGQuadrant } | null;
  source: "GATEWAY_SECTOR_RRG" | "UNAVAILABLE";
  closedThrough: string | null;
}

/** Hàm thuần — test được không cần mạng. */
export function buildIcbQuadrantMap(rrg: { closedThrough?: string | null; sectors: { code: string; level: number; name: string; quadrant: string }[] } | null,
  taxonomy: { symbols: Record<string, { l2?: string }> } | null): IcbQuadrantMap {
  if (!rrg || !taxonomy) return { of: () => null, source: "UNAVAILABLE", closedThrough: null };
  const sec = new Map(rrg.sectors.filter((s) => s.level === 2).map((s) => [s.code, s]));
  return {
    source: "GATEWAY_SECTOR_RRG", closedThrough: rrg.closedThrough ?? null,
    of(ticker) {
      const s = sec.get(taxonomy.symbols[ticker]?.l2 ?? "");
      return s && CASE[s.quadrant] ? { code: s.code, name: s.name, quadrant: CASE[s.quadrant] } : null;
    },
  };
}

export async function fetchIcbQuadrantMap(fetchImpl: typeof fetch = fetch): Promise<IcbQuadrantMap> {
  const get = async (p: string) => { const r = await fetchImpl(`${MARKET_GATEWAY_URL}${p}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json(); };
  try {
    const [rrg, tax] = await Promise.all([get("/api/market/sectors/rrg?level=2"), get("/api/market/sectors/taxonomy")]);
    return buildIcbQuadrantMap(rrg, tax);
  } catch (e) {
    console.warn("[gateway-quadrants] Không đọc được RRG ngành Gateway:", e);
    return buildIcbQuadrantMap(null, null);
  }
}
