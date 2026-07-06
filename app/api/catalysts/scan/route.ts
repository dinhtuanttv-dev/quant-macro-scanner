// app/api/catalysts/scan/route.ts
// Route này CHỈ được cron gọi để chạy 1 lần quét và lưu kết quả vào Redis.
// Vercel Cron luôn gửi request bằng GET, kèm header Authorization: Bearer <CRON_SECRET>.
//
// Redis: dùng đúng tên biến KV_REST_API_URL / KV_REST_API_TOKEN mà Vercel Marketplace
// (Upstash) tự cấp — KHÔNG dùng Redis.fromEnv() vì hàm đó chỉ tìm UPSTASH_REDIS_REST_*.
//
// Dữ liệu nguồn: đọc thẳng qua Prisma (CatalystSource/ImpactEdge), không qua API giả.
// fetchMarketSignals: TẠM THỜI dùng bảng tra cứu tay cho các mã đã seed, để demo đủ badge.
// Khi có dữ liệu thật, thay bằng cách gọi adapter giá (tcbs-adapter/yahoo-finance-adapter).

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { prisma } from "@/lib/prisma"; // đổi lại đường dẫn nếu singleton Prisma của cậu ở chỗ khác
import { CatalystEngine } from "@/lib/catalyst/CatalystEngine";
import type {
  CatalystSource,
  ImpactEdge,
  MarketSignal,
  CalibrationEntry,
  AlertConfig,
} from "@/lib/catalyst/types";

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

const MOCK_SIGNAL_OVERRIDES: Record<string, Partial<MarketSignal>> = {
  HPG: {
    priceInStatus: "not_reflected",
    volumeFlag: "confirmed",
    foreignFlowDirection: "buy",
    foreignFlowValue: "+2.1M CP",
    valuationPercentile: 0.35,
    liquidityScore: 0.9,
  },
  NKG: {
    priceInStatus: "reflected",
    volumeFlag: "none",
    foreignFlowDirection: "sell",
    foreignFlowValue: "-0.4M CP",
    valuationPercentile: 0.7,
    liquidityScore: 0.6,
  },
  VGC: {
    priceInStatus: "not_reflected",
    volumeFlag: "none",
    foreignFlowDirection: "none",
    valuationPercentile: 0.5,
    liquidityScore: 0.5,
  },
  NVL: {
    priceInStatus: "not_reflected",
    volumeFlag: "suspicious",
    foreignFlowDirection: "sell",
    foreignFlowValue: "-1.8M CP",
    valuationPercentile: 0.6,
    liquidityScore: 0.7,
  },
  VCB: {
    priceInStatus: "reflected",
    volumeFlag: "confirmed",
    foreignFlowDirection: "buy",
    foreignFlowValue: "+0.8M CP",
    valuationPercentile: 0.4,
    liquidityScore: 0.95,
  },
};

async function fetchMarketSignals(tickers: string[]): Promise<Map<string, MarketSignal>> {
  const map = new Map<string, MarketSignal>();
  for (const ticker of tickers) {
    const override = MOCK_SIGNAL_OVERRIDES[ticker];
    map.set(ticker, {
      ticker,
      priceInStatus: override?.priceInStatus ?? "not_reflected",
      volumeFlag: override?.volumeFlag ?? "none",
      foreignFlowDirection: override?.foreignFlowDirection ?? "none",
      foreignFlowValue: override?.foreignFlowValue,
      valuationPercentile: override?.valuationPercentile ?? 0.5,
      liquidityScore: override?.liquidityScore ?? 0.5,
      isWatchlisted: false, // sẽ được ghi đè đúng bằng watchlist thật trong runScan()
    });
  }
  return map;
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
  const { sources, edges } = await fetchSourcesAndEdges();

  const allTickers = Array.from(
    new Set(edges.filter((e) => e.targetType === "ticker").map((e) => e.targetId))
  );

  const [marketSignals, calibration, watchlistTickers, previousRanksRaw] = await Promise.all([
    fetchMarketSignals(allTickers),
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
    return NextResponse.json({ ok: true, scannedAt: snapshot.scannedAt, sectorCount: snapshot.sectors.length });
  } catch (err) {
    console.error("Catalyst scan failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}