// app/api/catalysts/scan/route.ts — PHASE 2 UPGRADE
// Da thay redis.set(key, data, {ex: 1800}) bang writeSnapshotSafe() - khong con
// TTL lam mat du lieu, thay bang co che "stale-aware" o tang doc (latest/route.ts).

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";
import { ingestFromMacroNews } from "@/lib/catalyst/newsIngestion";
import { fetchMarketSignalsReal } from "@/lib/catalyst/marketSignals";
import { stockUniverse } from "@/lib/quant-data";
import { writeSnapshotSafe } from "@/lib/catalyst/engine/SnapshotStore"; // ★PHASE 2
import type { CatalystSource, ImpactEdge, CalibrationEntry, AlertConfig } from "@/lib/catalyst/types";

export const maxDuration = 10;

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

async function fetchSourcesAndEdges(): Promise<{ sources: CatalystSource[]; edges: ImpactEdge[] }> {
  const sources = await prisma.catalystSource.findMany({ orderBy: { publishedDate: "desc" }, take: 200 });
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
  const [marketSignals, calibration, watchlistTickers, previousRanksRaw] = await Promise.all([
    fetchMarketSignalsReal(allTickers), fetchCalibration(), fetchWatchlistTickers(),
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
  const tickerImpacts = engine.getImpactForTickers(stockUniverse.map((s) => s.ticker));

  const snapshot = {
    scannedAt: new Date().toISOString(), ingestResult, sectors, emerging,
    upMovers, downMovers,
    totalBenefitCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "benefit").length,
    totalHarmCount: edges.filter((e) => e.targetType === "ticker" && e.direction === "harm").length,
    activeAlerts, upcomingEvents, tickerImpacts,
  };

  // ★PHASE 2: writeSnapshotSafe thay redis.set trực tiếp - không TTL, có lưu lịch sử
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
