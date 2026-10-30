// 31/10/2026 — Lượt quét Catalyst Engine, chạy trên Market Gateway (worker_thread). Engine, công thức và hình dạng snapshot GIỮ NGUYÊN so với
// /api/catalysts/scan cũ; chỉ đổi đầu vào và chỗ lưu để không phụ thuộc Neon/Upstash:
//   - tin: Event Radar trên Gateway (lib/catalyst/radarIngestion.ts) thay MacroNewsRecord;
//   - đồ thị CatalystSource/ImpactEdge, snapshot, sổ tín hiệu: bảng `catkv` của kho trên Gateway (Railway Volume) thay Neon + Upstash.
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";
import { buildStaticMacroCalendar } from "@/lib/catalyst/calendar/staticMacroCalendar";
import { recordNewSignal } from "@/lib/catalyst/engine/SignalLedger";
import { writeSnapshotSafe } from "@/lib/catalyst/engine/SnapshotStore";
import { resolveSectorNameSync, STANDARD_SECTORS } from "@/lib/catalyst/engine/SectorRegistry";
import { fetchGatewaySignalInputs } from "@/lib/catalyst/gatewaySignals";
import { fetchMarketSignalsReal } from "@/lib/catalyst/marketSignals";
import { mergeGraph, radarEventsToGraph, RADAR_CATALYST_TYPES, reviveGraph, type CatalystGraph, type RadarEventLike } from "@/lib/catalyst/radarIngestion";
import { storeList, storeUpsert } from "@/lib/cotuc/store/gateway-store";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { stockUniverse } from "@/lib/quant-data";
import type { Redis } from "@upstash/redis";
import type { AlertConfig, CatalystSource, ImpactEdge } from "@/lib/catalyst/types";
import { jobFail, jobOk, type JobResult } from "./job-result";

const DEFAULT_ALERT_CONFIG: AlertConfig = { minSectorNetScore: 6, maxDaysBeforeExecutionForAlert: 3, minCorroborationCount: 2 };
const MAX_HISTORY = 96;

const kvGet = async <T>(key: string): Promise<T | null> => (await storeList<{ value?: T }>("catkv", { keys: [key], fields: ["value"] }))[0]?.value ?? null;
const kvSet = (key: string, value: unknown) => storeUpsert("catkv", [{ key, value: JSON.parse(JSON.stringify(value)) }]);

/**
 * Giao diện Redis tối thiểu mà SnapshotStore / SignalLedger dùng, ghi vào kho Gateway. Sổ tín hiệu giữ trong bộ nhớ suốt lượt quét rồi
 * ghi một lần (không gọi HTTP theo từng cạnh tác động).
 */
function createStoreRedis(ledger: Record<string, unknown>) {
  let history: { score: number; member: string }[] | null = null;
  return {
    set: (key: string, value: unknown) => kvSet(key, value),
    hget: async (_k: string, f: string) => ledger[f] ?? null,
    hset: async (_k: string, v: Record<string, unknown>) => { Object.assign(ledger, v); return 1; },
    zadd: async (_k: string, e: { score: number; member: string }) => { history = [...((await kvGet<{ score: number; member: string }[]>("history")) ?? []), e].slice(-MAX_HISTORY); return kvSet("history", history); },
    zremrangebyrank: async () => 0,
  };
}

async function loadRadarEvents(): Promise<RadarEventLike[]> {
  // Từng nhóm một: API trả tối đa 250 tin xếp theo mức chú ý, gộp chung sẽ đẩy mất nhóm ít chú ý.
  const lists = await Promise.all(RADAR_CATALYST_TYPES.map(async (category) => {
    const res = await fetch(`${MARKET_GATEWAY_URL}/api/market/event-radar?limit=250&category=${category}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Event Radar HTTP ${res.status}`);
    return ((await res.json()) as { events?: RadarEventLike[] }).events ?? [];
  }));
  return lists.flat();
}

/** Ngành chuẩn của engine theo mã: 61 mã gốc, rồi danh mục Siêu Quét (meta.universe của kho). Ngành ngoài danh sách chuẩn -> null. */
async function loadSectorOf(): Promise<(ticker: string) => string | null> {
  const known = new Map(stockUniverse.map((s) => [s.ticker, s.sector as string]));
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  try {
    const meta = await storeList<{ tickers?: [string, string | null][] }>("meta", { keys: ["universe"] });
    for (const [t, s] of meta[0]?.tickers ?? []) if (s && !known.has(t)) known.set(t, fold(s));
  } catch { /* chỉ mất ngành suy từ mã */ }
  return (t) => {
    const s = known.get(t);
    if (!s) return null;
    return STANDARD_SECTORS.has(s) ? s : resolveSectorNameSync(s);
  };
}

function calendarSources(now: Date): CatalystSource[] {
  return buildStaticMacroCalendar(now).map((ev) => ({
    id: ev.id, title: ev.title, category: ev.category, sourceCredibility: "confirmed", publishedDate: now, firstDetectedAt: now,
    executionDate: ev.executionDate, corroborationCount: 1, sourceUrl: null,
  }));
}

export async function runCatalystScan(): Promise<JobResult> {
  try {
    const now = new Date();
    const [events, sectorOf, rawGraph] = await Promise.all([loadRadarEvents(), loadSectorOf(), kvGet<unknown>("graph")]);
    const converted = radarEventsToGraph(events, sectorOf);
    const incoming: CatalystGraph = { sources: [...converted.sources, ...calendarSources(now)], edges: converted.edges };
    const graph = mergeGraph(reviveGraph(rawGraph), incoming, now.getTime());
    await kvSet("graph", graph);

    const { sources, edges } = graph as { sources: CatalystSource[]; edges: ImpactEdge[] };
    const allTickers = [...new Set(edges.filter((e) => e.targetType === "ticker").map((e) => e.targetId))];
    const gatewayInputs = await fetchGatewaySignalInputs();
    const universe = gatewayInputs.ok ? [...new Set([...gatewayInputs.tickers.keys(), ...stockUniverse.map((s) => s.ticker)])] : stockUniverse.map((s) => s.ticker);
    const [marketSignals, previousRanksRaw, ledger] = await Promise.all([
      fetchMarketSignalsReal(allTickers, gatewayInputs), kvGet<Record<string, number>>("ranks"), kvGet<Record<string, unknown>>("ledger"),
    ]);
    const engine = new CatalystEngine(sources, edges, marketSignals, [], new Map(Object.entries(previousRanksRaw ?? {})));

    const upMovers = engine.getTopMovers("benefit", 20);
    const downMovers = engine.getTopMovers("harm", 20);
    const snapshot = {
      scannedAt: now.toISOString(),
      ingestResult: converted.stats,
      sectors: engine.getSectorRankings(),
      emerging: engine.getEmergingSources(120),
      marketData: { source: gatewayInputs.ok ? "gateway" : "unavailable", dataAsOf: gatewayInputs.dataAsOf, universeSize: universe.length, error: gatewayInputs.error ?? null },
      newsSource: "event-radar",
      upMovers, downMovers,
      totalBenefitCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "benefit").length,
      totalHarmCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "harm").length,
      activeAlerts: engine.getActiveAlerts(DEFAULT_ALERT_CONFIG),
      upcomingEvents: engine.getUpcomingMacroEvents(10),
      tickerImpacts: engine.getImpactForTickers(universe),
    };

    // Sổ tín hiệu: mỗi cặp tin × mã ghi một lần, làm nền cho kiểm định tiến khi đủ mẫu.
    const ledgerMap = ledger ?? {};
    const redis = createStoreRedis(ledgerMap) as unknown as Redis;
    const bySource = new Map(sources.map((s) => [s.id, s]));
    for (const e of edges) {
      const source = bySource.get(e.sourceId);
      if (e.targetType === "ticker" && source) {
        await recordNewSignal(redis, { ticker: e.targetId, category: source.category, propagationDistance: e.propagationDistance, direction: e.direction, sourceId: e.sourceId });
      }
    }
    await kvSet("ledger", ledgerMap);

    await writeSnapshotSafe(redis, snapshot); // khoá catalyst:snapshot:latest — chỉ ghi khi đã tính xong
    const nextRanks: Record<string, number> = {};
    for (const m of [...upMovers, ...downMovers]) nextRanks[m.ticker] = m.rank;
    await kvSet("ranks", nextRanks);

    return jobOk({
      ok: true, scannedAt: snapshot.scannedAt, ingestResult: snapshot.ingestResult, radarEvents: events.length, sources: sources.length, edges: edges.length,
      sectorCount: snapshot.sectors.length, upcomingEventCount: snapshot.upcomingEvents.length, benefit: snapshot.totalBenefitCount, harm: snapshot.totalHarmCount, ledger: Object.keys(ledgerMap).length,
    });
  } catch (err) {
    console.error("[catalyst-scan]", err);
    return jobFail({ error: `Không quét được Chất xúc tác: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` });
  }
}
