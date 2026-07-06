// app/api/catalysts/scan/route.ts
// Route này CHỈ được cron gọi để chạy 1 lần quét và lưu kết quả vào Redis.
// Vercel Cron luôn gửi request bằng GET, kèm header Authorization: Bearer <CRON_SECRET>.

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma";
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";
import { ingestFromMacroNews } from "@/lib/catalyst/newsIngestion";
import { fetchMarketSignalsReal } from "@/lib/catalyst/marketSignals";
import type {
  CatalystSource,
  ImpactEdge,
  CalibrationEntry,
  AlertConfig,
} from "@/lib/catalyst/types";

// Khớp với giới hạn Vercel Hobby (10s) — cùng nguyên tắc /api/market-data đang áp dụng.
export const maxDuration = 10;

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

async function fetchSourcesAndEdges(): Promise<{ sources: CatalystSource[]; edges: ImpactEdge[] }> {
  const sources = await prisma.catalystSource.findMany({
    orderBy: { publishedDate: "desc" },
    take: 200,
  });
  const edges = await prisma.impactEdge.findMany({
    where: { sourceId: { in: sources.map((s) => s.id) } },
  });
  return { sources, edges };
}

async function fetchCalibration(): Promise<CalibrationEntry[]> {
  const cached = await redis.get<CalibrationEntry[]>("catalyst:calibration");
  return cached ?? [];
}

async function fetchWatchlistTickers(): Promise<Set<string>> {
  const list = await redis.get<string[]>("catalyst:watchlist");
  return new Set(list ?? []);
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  minSectorNetScore: 6,
  maxDaysBeforeExecutionForAlert: 3,
  minCorroborationCount: 2,
};

async function runScan() {
  const ingestResult = await ingestFromMacroNews();
  console.log("News ingestion:", ingestResult);

  const { sources, edges } = await fetchSourcesAndEdges();

  const allTickers = Array.from(
    new Set(edges.filter((e) => e.targetType === "ticker").map((e) => e.targetId))
  );

  const [marketSignals, calibration, watchlistTickers, previousRanksRaw] = await Promise.all([
    fetchMarketSignalsReal(allTickers),
    fetchCalibration(),
    fetchWatchlistTickers(),
    redis.get<Record<string, number>>("catalyst:ranks:previous"),
  ]);

  for (const ticker of watchlistTickers) {
    const signal = marketSignals.get(ticker);
    if (signal) signal.isWatchlisted = true;
  }

  const previousRanks = new Map<string, number>(Object.entries(previousRanksRaw ?? {}));

  const engine = new CatalystEngine(sources, edges, marketSignals, calibration, previousRanks);

  const sectors = engine.getSectorRankings();
  const emerging = engine.getEmergingSources(120);
  const upMovers = engine.getTopMovers("benefit", 20);
  const downMovers = engine.getTopMovers("harm", 20);
  const activeAlerts = engine.getActiveAlerts(DEFAULT_ALERT_CONFIG);

  const totalBenefitCount = edges.filter((e) => e.targetType === "ticker" && e.direction === "benefit").length;
  const totalHarmCount = edges.filter((e) => e.targetType === "ticker" && e.direction === "harm").length;

  const snapshot = {
    scannedAt: new Date().toISOString(),
    ingestResult,
    sectors,
    emerging,
    upMovers,
    downMovers,
    totalBenefitCount,
    totalHarmCount,
    activeAlerts,
  };

  await redis.set("catalyst:snapshot:latest", snapshot, { ex: 60 * 30 });

  const nextRanks: Record<string, number> = {};
  upMovers.forEach((m) => (nextRanks[m.ticker] = m.rank));
  downMovers.forEach((m) => (nextRanks[m.ticker] = m.rank));
  await redis.set("catalyst:ranks:previous", nextRanks);

  return snapshot;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await runScan();
    return NextResponse.json({
      ok: true,
      scannedAt: snapshot.scannedAt,
      sectorCount: snapshot.sectors.length,
      ingestResult: snapshot.ingestResult,
    });
  } catch (err) {
    console.error("Catalyst scan failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}