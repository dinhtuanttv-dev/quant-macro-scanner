import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { appendIntradayBar, fetchLiveIndex, fetchLiveQuotes } from "@/lib/cotuc/timing-v3/intraday";
import { buildCycleContext, buildCycleStatsV3, fetchBenchmarkPricesOnce, type CycleComputeContext } from "@/lib/cotuc/timing-v3/compute-cycle-io";
import { buildRequiredOffsets } from "@/lib/cotuc/timing-v3/candidate-windows";
import { refreshVnHolidayCalendar, vnHolidayCalendar } from "@/lib/cotuc/timing-v3/vn-holidays";
import { estimatePriorFromRates } from "@/lib/cotuc/timing-v3/seasonality/beta-binomial";
import { classifyMarketRegime } from "@/lib/cotuc/timing-v3/decision/market-regime";
import { buildDecisionSnapshot, resolveUpcomingExDate } from "@/lib/cotuc/timing-v3/decision/build-decision";
import { planIssue, planResolutions, type TrackRow } from "@/lib/cotuc/timing-v3/decision/tracking";
import { selectedWindow } from "@/lib/cotuc/timing-v3/decision/optimize-dividend-timing";
import type { CycleStatsV3, EarningsCycleStatsV3, EarningsSignal } from "@/lib/cotuc/timing-v3/timing-types";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

// Cron tinh TimingSignal cho DIVIDEND_STOCKS, luu TimingSignalCache (route /api/cotuc/timing-signals chi doc).
// Giai doan 4 (2026-10): cung lan quet nay (dung lai gia SSI da tai) tinh them DecisionState 3 trang thai
// -> CotucDecisionState, va theo doi tin hieu thuc te -> CotucSignalTrack (ghi khi vao vung mua, ghi ket qua
// khi toi ngay thoat). learnSignalWeights / calibration KHONG chay o day (chua bat).
//
// Sua 2 loi cu: (1) action/tdToEx tinh tu GDKHQ QUA KHU gan nhat -> moi ma deu POST_EX; nay dung GDKHQ SAP TOI
// (VNDirect da thong bao, khong co thi uoc tinh theo chu ky chi - danh dau ESTIMATED). (2) generatedAt chi dat
// luc tao dong -> asOf dung yen; nay cap nhat moi lan quet.
//
// Hobby plan: van ho tro offset/limit de chia nho khi can (prior lien ma chi tinh tren cac ma trong lan goi).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 8;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Ngày lịch VN (UTC+7) — cron chạy 22:50 UTC = 05:50 sáng hôm sau giờ VN. */
function vnToday(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

const toJson = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function rowToTrack(r: {
  id: string; ticker: string; windowId: string; level: string; predictedProbability: number; components: unknown; exDate: string; exDateStatus: string;
  entryDate: string; plannedExitDate: string; issuedAt: Date; outcome: number | null; realizedCar: number | null; exitDate: string | null; outcomeRecordedAt: Date | null;
}): TrackRow {
  return {
    ...r, level: r.level as DecisionLevel, components: (r.components ?? []) as TrackRow["components"], issuedAt: r.issuedAt.toISOString(),
    outcome: r.outcome === null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const offset = Number(searchParams.get("offset") ?? "0");
    const limit = Math.max(1, Math.min(60, Number(searchParams.get("limit") ?? "25")));

    // Lịch nghỉ: quy tắc tự tính + lớp Gateway (phiên thật / ngày nghỉ nối) — lỗi thì vẫn chạy bằng quy tắc.
    await refreshVnHolidayCalendar();
    const benchmarkPrices = await fetchBenchmarkPricesOnce();
    if ("reason" in benchmarkPrices) {
      return NextResponse.json({ error: "Không tải được giá VN-Index.", detail: benchmarkPrices.detail }, { status: 500 });
    }

    // Danh mục = danh mục Siêu Quét AI (~300 mã, Market Gateway); quét theo lô offset/limit (Gateway gọi liên tục).
    const universe = await getCotucUniverse();
    const allTickers = universe.tickers.map((t) => t.ticker);
    const tickers = allTickers.slice(offset, offset + limit);
    const today = vnToday();
    const now = new Date();
    // Giá trong phiên (SSI qua Gateway) cho ảnh chụp quyết định; chấm kết quả theo dõi vẫn dùng giá đóng cửa.
    const [liveQuotes, liveIndex] = await Promise.all([fetchLiveQuotes(tickers), fetchLiveIndex("VNINDEX")]);
    const benchLive = appendIntradayBar(benchmarkPrices, liveIndex);
    const regime = classifyMarketRegime({ closes: benchLive.filter((p) => p.date <= today).map((p) => p.adjClose) });

    // 1) Giá + backtest cho từng mã.
    const ctxs: { ctx: CycleComputeContext; stats: CycleStatsV3 }[] = [];
    const noHistory: string[] = [];
    let skippedCount = 0;
    for (const batch of chunk(tickers, BATCH_SIZE)) {
      const results = await Promise.all(batch.map(async (ticker) => {
        try {
          const ctx = await buildCycleContext(ticker, benchmarkPrices);
          if ("reason" in ctx) {
            if (ctx.reason === "NO_DIVIDEND_HISTORY") noHistory.push(ticker);
            return null;
          }
          return { ctx, stats: buildCycleStatsV3(ctx) };
        } catch (e) {
          console.error(`[timing-signals-scan] ${ticker}:`, e);
          return null;
        }
      }));
      for (const r of results) { if (r) ctxs.push(r); else skippedCount++; }
    }

    // 2) Prior Beta liên mã cho tỷ lệ thắng từng cửa sổ (leave-one-out, cần ≥ 5 mã khác có ≥ 3 đợt): lô hiện tại +
    //    tỷ lệ thắng đã lưu của các mã khác trong danh mục (snapshot.backtest) -> prior không phụ thuộc cách chia lô.
    type Rate = { ticker: string; id: string; nEvents: number; winRate: number };
    const batchRates: Rate[] = ctxs.flatMap((c) => c.stats.windows.map((w) => ({ ticker: c.ctx.ticker, id: w.id, nEvents: w.nEvents, winRate: w.winRate })));
    const inBatch = new Set(ctxs.map((c) => c.ctx.ticker));
    const storedRows = await prisma.cotucDecisionState.findMany({ where: { ticker: { notIn: [...inBatch] } }, select: { ticker: true, snapshot: true } });
    const storedRates: Rate[] = storedRows.flatMap((r) => {
      const bt = (r.snapshot as { backtest?: { id: string; nEvents: number; winRate: number }[] } | null)?.backtest ?? [];
      return bt.map((w) => ({ ticker: r.ticker, ...w }));
    });
    const allRates = [...batchRates, ...storedRates];
    const windowIds = new Set(allRates.map((r) => r.id));
    const priorFor = (ticker: string): Record<string, { alpha0: number; beta0: number }> => {
      const out: Record<string, { alpha0: number; beta0: number }> = {};
      for (const id of windowIds) {
        const rates = allRates.filter((r) => r.ticker !== ticker && r.id === id && r.nEvents >= 3).map((r) => r.winRate);
        if (rates.length >= 5) out[id] = estimatePriorFromRates(rates, 10);
      }
      return out;
    };

    // 3) Mùa vụ KQKD (đã có từ cron earnings-seasonality-scan).
    const seasonRows = await prisma.earningsSeasonalityCache.findMany({
      where: { ticker: { in: ctxs.map((c) => c.ctx.ticker) } },
      select: { ticker: true, earningsSignal: true, stats: true },
    });
    const seasonBy = new Map(seasonRows.map((r) => [r.ticker, r]));

    const offsets = buildRequiredOffsets();
    let savedCount = 0, decisionCount = 0, issuedCount = 0, resolvedCount = 0;
    const levels: Record<string, number> = {};
    const errors: string[] = [];

    for (const { ctx, stats } of ctxs) {
      const ticker = ctx.ticker;
      try {
        const season = seasonBy.get(ticker);
        const earnings = (season?.earningsSignal ?? null) as unknown as EarningsSignal | null;
        const q = earnings ? Number(earnings.quarterLabel.match(/^Q([1-4])/)?.[1] ?? 0) : 0;
        const earningsStats = q ? (((season?.stats ?? {}) as unknown as Record<string, EarningsCycleStatsV3>)[String(q)] ?? null) : null;

        const selWin = selectedWindow(stats);
        const exDate = resolveUpcomingExDate(today, ctx.cashExDates ?? [], ctx.eventExDates, now.toISOString(), vnHolidayCalendar,
          selWin && selWin.entryFrom > 0 ? selWin : null);
        const snap = buildDecisionSnapshot({
          ticker, today, cal: vnHolidayCalendar, stats, offsets, eventPaths: ctx.cyclePaths.eventPaths,
          stockPrices: appendIntradayBar(ctx.stockPrices ?? [], liveQuotes.get(ticker)), benchmarkPrices: benchLive,
          exDate, earnings, earningsStats, avgValue20: ctx.avgValue20 ?? null, dividendPriors: priorFor(ticker), regime,
        });
        // backtest: đủ trường để (1) tính prior liên mã, (2) Timeline điểm mua dựng bậc "gần đạt" (buy-timeline.ts).
        const snapToStore = {
          ...snap,
          backtest: stats.windows.map((w) => ({
            id: w.id, label: w.label, entryFrom: w.entryFrom, entryTo: w.entryTo, exitOffset: w.exitOffset, nEvents: w.nEvents,
            winRate: w.winRate, netExpectancy: w.netExpectancy, netExpectancyLcb: w.netExpectancyLcb, fdrQValue: w.fdrQValue,
            oosMeanNet: w.oosMeanNet, selected: w.selected && w.id === stats.selectedWindowId,
          })),
        };
        const rec = snap.recommendation;
        const sel = selectedWindow(stats);
        const baseConfidence = sel ? (sel.nEvents >= 12 && (sel.oosMeanNet ?? -1) > 0 ? "HIGH" : sel.nEvents >= 8 ? "MEDIUM" : "LOW") : null;

        const timingRow = {
          ticker, action: rec.action, tdToEx: rec.tdToEx,
          windowEntryFrom: sel?.entryFrom ?? null, windowEntryTo: sel?.entryTo ?? null, windowExitOffset: sel?.exitOffset ?? null,
          expectedNetReturn: sel?.netExpectancyLcb ?? null, nEvents: sel?.nEvents ?? null, fdrQValue: sel?.fdrQValue ?? null,
          confidence: rec.confidence ?? baseConfidence, generatedAt: now,
        };
        await prisma.timingSignalCache.upsert({ where: { ticker }, create: timingRow, update: timingRow });
        savedCount++;

        const decisionRow = {
          ticker, level: snap.decision.level, action: rec.action, combinedProbability: snap.decision.combinedProbability,
          snapshot: toJson(snapToStore), computedAt: now,
        };
        await prisma.cotucDecisionState.upsert({ where: { ticker }, create: decisionRow, update: decisionRow });
        decisionCount++;
        levels[snap.decision.level] = (levels[snap.decision.level] ?? 0) + 1;

        // 4) Theo dõi thực tế: ghi kết quả các tín hiệu đã tới ngày thoát, rồi ghi tín hiệu mới (nếu có).
        const existing = (await prisma.cotucSignalTrack.findMany({ where: { ticker } })).map(rowToTrack);
        for (const r of planResolutions(existing, ctx.stockPrices ?? [], ctx.benchmarkPrices ?? benchmarkPrices)) {
          await prisma.cotucSignalTrack.update({
            where: { id: r.id },
            data: { outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: now },
          });
          resolvedCount++;
        }
        const issue = planIssue(snap, existing, vnHolidayCalendar, now.toISOString());
        if (issue) {
          await prisma.cotucSignalTrack.create({
            data: {
              id: issue.id, ticker, windowId: issue.windowId, level: issue.level, predictedProbability: issue.predictedProbability,
              components: toJson(issue.components), exDate: issue.exDate, exDateStatus: issue.exDateStatus, entryDate: issue.entryDate,
              plannedExitDate: issue.plannedExitDate, issuedAt: now,
            },
          });
          issuedCount++;
        }
      } catch (e) {
        errors.push(`${ticker}: ${e instanceof Error ? e.message : String(e)}`);
        console.error(`[timing-signals-scan] decision ${ticker}:`, e);
      }
    }

    // Mã chưa từng chi cổ tức tiền mặt: vẫn ghi một dòng NO_DATE để Screener hiện đúng trạng thái thay vì trống.
    for (const ticker of noHistory) {
      const row = {
        ticker, action: "NO_DATE", tdToEx: null, windowEntryFrom: null, windowEntryTo: null, windowExitOffset: null,
        expectedNetReturn: null, nEvents: null, fdrQValue: null, confidence: null, generatedAt: now,
      };
      await prisma.timingSignalCache.upsert({ where: { ticker }, create: row, update: row });
    }

    const nextOffset = offset + limit >= allTickers.length ? 0 : offset + limit;
    return NextResponse.json({
      savedCount, skippedCount, noDividendHistory: noHistory.length, decisionCount, levels, regime: regime.regime, issuedCount, resolvedCount, errors,
      processedInThisCall: tickers.length, offset, limit, nextOffset, totalTickers: allTickers.length, universeSource: universe.source,
      intraday: { quotes: liveQuotes.size, index: liveIndex }, today,
    });
  } catch (err) {
    console.error("[api/cron/timing-signals-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không quét được Timing Signals." }, { status: 500 });
  }
}
