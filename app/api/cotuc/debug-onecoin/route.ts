import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCycleContext, buildCycleStatsV3, fetchBenchmarkPricesOnce } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// ROUTE DEBUG TAM THOI - do THOI GIAN TUNG BUOC cho DUNG 1 ma, de tim
// chinh xac buoc nao cham/treo (fetchBenchmarkPricesOnce da xac nhan
// NHANH ~1.8s, khong phai nguyen nhan - can co lap tiep buildCycleContext/
// buildCycleStatsV3/prisma.upsert).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker")?.toUpperCase() ?? "FPT";
  const timings: Record<string, number> = {};
  let t = Date.now();
  console.error(`[debug-onecoin] BAT DAU ${ticker}`);

  const benchmarkPrices = await fetchBenchmarkPricesOnce();
  timings.fetchBenchmark = Date.now() - t; t = Date.now();
  console.error(`[debug-onecoin] ${ticker} - fetchBenchmark XONG (${timings.fetchBenchmark}ms)`);
  if ("reason" in benchmarkPrices) return NextResponse.json({ timings, error: benchmarkPrices.detail });

  const ctx = await buildCycleContext(ticker, benchmarkPrices);
  timings.buildCycleContext = Date.now() - t; t = Date.now();
  console.error(`[debug-onecoin] ${ticker} - buildCycleContext XONG (${timings.buildCycleContext}ms)`);
  if ("reason" in ctx) return NextResponse.json({ timings, error: ctx.detail, reason: ctx.reason });
  console.error(`[debug-onecoin] ${ticker} - so su kien lich su: ${ctx.eventExDates.length}, so mau CAR path: ${ctx.cyclePaths.eventPaths.length}`);

  const stats = buildCycleStatsV3(ctx);
  timings.buildCycleStatsV3 = Date.now() - t; t = Date.now();
  console.error(`[debug-onecoin] ${ticker} - buildCycleStatsV3 XONG (${timings.buildCycleStatsV3}ms)`);

  await prisma.timingSignalCache.upsert({
    where: { ticker },
    create: { ticker, action: "DEBUG_TEST" },
    update: { action: "DEBUG_TEST" },
  });
  timings.prismaUpsert = Date.now() - t;
  console.error(`[debug-onecoin] ${ticker} - HOAN TAT (prismaUpsert ${timings.prismaUpsert}ms)`);

  return NextResponse.json({ ticker, timings, totalMs: Object.values(timings).reduce((a, b) => a + b, 0) });
}
