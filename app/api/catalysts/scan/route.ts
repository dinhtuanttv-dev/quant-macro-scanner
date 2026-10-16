// app/api/catalysts/scan/route.ts - PHASE 2 + PHASE 3 UPGRADE
// PHASE 2: Da thay redis.set(key, data, {ex: 1800}) bang writeSnapshotSafe() - khong con
// TTL lam mat du lieu, thay bang co che "stale-aware" o tang doc (latest/route.ts).
// PHASE 3: Ghi tung tin hieu that vao SignalLedger de sau nay doi chieu gia that,
// tinh ra ty le thang that - thay the historicalWinRate=50 bia truoc day.

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";
import { ingestFromMacroNews, NEUTRAL_IMPACT } from "@/lib/catalyst/newsIngestion";
import { fetchMarketSignalsReal } from "@/lib/catalyst/marketSignals";
import { fetchGatewaySignalInputs } from "@/lib/catalyst/gatewaySignals";
import { stockUniverse } from "@/lib/quant-data";
import { writeSnapshotSafe } from "@/lib/catalyst/engine/SnapshotStore";
import { isTraceableSource } from "@/lib/catalyst/provenance";
import { recordNewSignal } from "@/lib/catalyst/engine/SignalLedger";
import type { CatalystSource, ImpactEdge, CalibrationEntry, AlertConfig } from "@/lib/catalyst/types";

export const maxDuration = 60;

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

async function fetchSourcesAndEdges(): Promise<{ sources: CatalystSource[]; edges: ImpactEdge[] }> {
  const all = await prisma.catalystSource.findMany({ orderBy: { publishedDate: "desc" }, take: 200 });
  // X1: nguồn tạo từ tin TRUNG LẬP (rawImpact = 0, VD GDKHQ cổ tức) trước bản sửa đã bị gán "benefit" — loại khi đọc
  // (không xoá dữ liệu cũ trong DB).
  const originIds = all.map((s: { originRecordId?: string | null }) => s.originRecordId).filter((x: string | null | undefined): x is string => !!x);
  const neutral = originIds.length
    ? new Set((await prisma.macroNewsRecord.findMany({ where: { id: { in: originIds }, rawImpact: NEUTRAL_IMPACT }, select: { id: true } })).map((r: { id: string }) => r.id))
    : new Set<string>();
  // Nguồn gốc: chỉ nguồn TRUY ĐƯỢC (originRecordId hoặc sourceUrl) — loại dữ liệu mẫu còn sót trong DB (lib/catalyst/provenance.ts).
  const sources: CatalystSource[] = all.filter((s: { originRecordId?: string | null; sourceUrl?: string | null }) =>
    isTraceableSource(s) && (!s.originRecordId || !neutral.has(s.originRecordId)));
  const edges = await prisma.impactEdge.findMany({ where: { sourceId: { in: sources.map((s) => s.id) } } });
  return { sources, edges };
}

async function fetchCalibration(): Promise<CalibrationEntry[]> {
  return (await redis.get<CalibrationEntry[]>("catalyst:calibration")) ?? [];
}

async function fetchWatchlistTickers(): Promise<Set<string>> {
  return new Set((await redis.get<string[]>("catalyst:watchlist")) ?? []);
}

const DEFAULT_ALERT_CONFIG: AlertConfig = { minSectorNetScore: 6, maxDaysBeforeExecutionForAlert: 3, minCorroborationCount: 2 };

async function runScan() {
  const ingestResult = await ingestFromMacroNews();
  const { sources, edges } = await fetchSourcesAndEdges();
  const allTickers = Array.from(new Set(edges.filter((e) => e.targetType === "ticker").map((e) => e.targetId)));
  // X1: universe = Siêu Quét trên Gateway (~276 mã, giá điều chỉnh) thay vì 61 mã stockUniverse; Gateway lỗi -> giữ 61 mã cũ.
  const gatewayInputs = await fetchGatewaySignalInputs();
  const universe = gatewayInputs.ok ? [...new Set([...gatewayInputs.tickers.keys(), ...stockUniverse.map((s) => s.ticker)])] : stockUniverse.map((s) => s.ticker);
  const [marketSignals, calibration, watchlistTickers, previousRanksRaw] = await Promise.all([
    fetchMarketSignalsReal(allTickers, gatewayInputs), fetchCalibration(), fetchWatchlistTickers(),
    redis.get<Record<string, number>>("catalyst:ranks:previous"),
  ]);
  for (const ticker of watchlistTickers) { const s = marketSignals.get(ticker); if (s) s.isWatchlisted = true; }
  const previousRanks = new Map<string, number>(Object.entries(previousRanksRaw ?? {}));
  const engine = new CatalystEngine(sources, edges, marketSignals, calibration, previousRanks);

  const sectors = engine.getSectorRankings();
  const emerging = engine.getEmergingSources(120);
  const upMovers = engine.getTopMovers("benefit", 20);
  const downMovers = engine.getTopMovers("harm", 20);
  const activeAlerts = engine.getActiveAlerts(DEFAULT_ALERT_CONFIG);
  const upcomingEvents = engine.getUpcomingMacroEvents(10);
  const tickerImpacts = engine.getImpactForTickers(universe);

  const snapshot = {
    scannedAt: new Date().toISOString(), ingestResult, sectors, emerging,
    marketData: { source: gatewayInputs.ok ? "gateway" : "unavailable", dataAsOf: gatewayInputs.dataAsOf, universeSize: universe.length, error: gatewayInputs.error ?? null },
    upMovers, downMovers,
    totalBenefitCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "benefit").length,
    totalHarmCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "harm").length,
    activeAlerts, upcomingEvents, tickerImpacts,
  };

  // PHASE 3: ghi tung tin hieu that vao SignalLedger truoc khi luu snapshot -
  // chay song song, bo qua loi rieng le (khong lam gian doan scan chinh).
  const allTickerEdges = edges.filter((e) => e.targetType === "ticker");
  await Promise.allSettled(allTickerEdges.map(async (e) => {
    const source = sources.find((s) => s.id === e.sourceId);
    if (!source) return;
    await recordNewSignal(redis, {
      ticker: e.targetId,
      category: source.category,
      propagationDistance: e.propagationDistance,
      direction: e.direction,
      sourceId: e.sourceId,
    });
  }));

  // PHASE 2: writeSnapshotSafe thay redis.set truc tiep - khong TTL, co luu lich su
  await writeSnapshotSafe(redis, snapshot);

  const nextRanks: Record<string, number> = {};
  upMovers.forEach((m) => (nextRanks[m.ticker] = m.rank));
  downMovers.forEach((m) => (nextRanks[m.ticker] = m.rank));
  await redis.set("catalyst:ranks:previous", nextRanks);

  return snapshot;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await runScan();
    return NextResponse.json({
      ok: true, scannedAt: snapshot.scannedAt, sectorCount: snapshot.sectors.length,
      ingestResult: snapshot.ingestResult, upcomingEventCount: snapshot.upcomingEvents.length,
    });
  } catch (err) {
    console.error("Catalyst scan failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

