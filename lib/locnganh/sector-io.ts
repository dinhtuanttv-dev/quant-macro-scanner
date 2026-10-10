/**
 * lib/locnganh/sector-io.ts — I/O của engine xoay vòng ngành (L2): đọc Market Gateway (chỉ đọc) + Risk-On macro + Confluence
 * Top 20 đã có của Lọc ngành. Không ghi DB.
 *   - /api/market/sectors/rrg            tóm tắt mọi ngành ICB (cấp 2/3), góc phần tư đã lọc nhiễu, tuần đã đóng
 *   - /api/market/sectors/:code/history  RRG tuần đầy đủ + chỉ số ngành theo ngày (giá điều chỉnh)
 *   - /api/market/sectors/taxonomy       mã -> ngành ICB (gom Confluence Score Top 20 theo ngành)
 *   - /api/market/ohlcv?symbol=VNINDEX   benchmark theo ngày (cùng kho với chỉ số ngành)
 */
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { fetchRiskOnScore } from "@/lib/sector-filter/compute-top20";
import type { PricePoint } from "@/lib/cotuc/timing-v3/compute-cycle-paths";
import type { GatewaySectorHistory, GatewaySectorSummary, SectorTimingInput } from "./sector-timing";
import type { MacroRegime } from "./sector-types";
import { fetchGatewayHolidays, makeVnTradingCalendar } from "@/lib/cotuc/timing-v3/vn-trading-calendar";

interface RrgSummaryDoc { engine: string; dataAsOf: string; closedThrough: string | null; partialWeek: boolean; method: string; coverage: unknown; sectors: GatewaySectorSummary[] }

async function getJson<T>(path: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${MARKET_GATEWAY_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Gateway ${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Ngưỡng giống hệt nhãn Risk-On của tab Lọc ngành (LocNganhPanel / weighted-macro-score). */
export const macroRegimeOf = (score: number | null): MacroRegime => (score === null ? "TRUNG_LAP" : score >= 65 ? "RISK_ON" : score <= 35 ? "RISK_OFF" : "TRUNG_LAP");

/** Confluence Score trung bình theo ngành ICB (cấp 2 và 3) từ bản Top 20 mới nhất (bảng SectorTop20Entry, chỉ đọc). */
export function groupConfluence(rows: { ticker: string; confluenceScore: number }[], symbols: Record<string, { l2?: string; l3?: string }>): Map<string, number> {
  const acc = new Map<string, number[]>();
  for (const r of rows) {
    for (const code of [symbols[r.ticker]?.l2, symbols[r.ticker]?.l3]) {
      if (!code) continue;
      if (!acc.has(code)) acc.set(code, []);
      acc.get(code)!.push(r.confluenceScore);
    }
  }
  return new Map([...acc].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}

async function confluenceBySector(symbols: Record<string, { l2?: string; l3?: string }>): Promise<Map<string, number>> {
  try {
    const { prisma } = await import("@/lib/prisma"); // import lười: thiếu DB / Prisma client -> bỏ Confluence, engine vẫn chạy
    const latest = await prisma.sectorTop20Entry.findFirst({ orderBy: { generatedAt: "desc" }, select: { generatedAt: true } });
    if (!latest) return new Map();
    const rows = await prisma.sectorTop20Entry.findMany({ where: { generatedAt: latest.generatedAt }, select: { ticker: true, confluenceScore: true } });
    return groupConfluence(rows, symbols);
  } catch {
    return new Map(); // chưa có bảng / lỗi DB -> không có Confluence (null, không chặn quyết định)
  }
}

export interface SectorTimingContext extends SectorTimingInput { engine: string; gatewayAsOf: string; method: string; coverage: unknown; riskOnScore: number | null }

export async function loadSectorTimingInput(): Promise<SectorTimingContext> {
  const [summary, taxonomy] = await Promise.all([
    getJson<RrgSummaryDoc>("/api/market/sectors/rrg", 60_000),
    getJson<{ symbols: Record<string, { l1?: string; l2?: string; l3?: string }> }>("/api/market/sectors/taxonomy").catch(() => ({ symbols: {} as Record<string, { l2?: string; l3?: string }> })),
  ]);
  const year = Number(summary.dataAsOf.slice(0, 4));
  const [histories, bench, riskOnScore, confluence, holidays] = await Promise.all([
    mapLimit(summary.sectors, 6, (s) => getJson<GatewaySectorHistory>(`/api/market/sectors/${s.code}/history`).catch(() => null)),
    getJson<{ bars: { date: string; close: number; partial?: boolean }[] }>("/api/market/ohlcv?symbol=VNINDEX&range=5y", 30_000),
    fetchRiskOnScore().catch(() => null),
    confluenceBySector(taxonomy.symbols),
    fetchGatewayHolidays(MARKET_GATEWAY_URL, `${year - 6}-01-01`, `${year + 1}-12-31`),
  ]);
  const l1Of = new Map<string, string | null>(summary.sectors.filter((s) => s.level === 2).map((s) => [s.code, s.parent]));
  const benchPrices: PricePoint[] = bench.bars.filter((b) => !b.partial && b.close > 0).map((b) => ({ date: b.date, adjClose: b.close }));
  return {
    engine: summary.engine, gatewayAsOf: summary.dataAsOf, method: summary.method, coverage: summary.coverage, riskOnScore,
    summaries: summary.sectors,
    histories: new Map(histories.filter((h): h is GatewaySectorHistory => !!h).map((h) => [h.code, h])),
    l1Of, bench: benchPrices, closedThrough: summary.closedThrough, asOf: benchPrices.at(-1)?.date ?? summary.dataAsOf,
    macroRegime: macroRegimeOf(riskOnScore), confluenceBySector: confluence, cal: makeVnTradingCalendar(holidays),
  };
}
