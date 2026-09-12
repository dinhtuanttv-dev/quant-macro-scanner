import { NextResponse } from "next/server";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { fetchQuarterlyBalanceBatch } from "@/lib/cotuc/vci-balance-sheet-adapter";
import { fetchQuoteBatch } from "@/lib/market-data/yahoo-finance-adapter";
import { calculateEarningsGrowth } from "@/lib/cotuc/earnings-scoring";
import {
  calculateTier1Score, calculateTier2Score, calculateTier3Score,
  calculateConsecutiveYears, calculateMedian, detectDividendRedFlag,
} from "@/lib/cotuc/dividend-quality-score";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { prisma } from "@/lib/prisma";

// P2 (Bo Loc toan thi truong) - JOB 2/2: tinh Dividend Quality Score
// Tang 1-3 day du, CHI cho 1 BATCH NHO (20 ma/lan) theo VONG XOAY (uu
// tien ma CHUA TUNG tinh, roi toi ma CU NHAT) - AN TOAN TUYET DOI tren
// goi Hobby (Vercel Cron 1 lan/ngay, khong the chay nhieu lan de xu ly
// het 71 ma trong 1 ngay). Voi ~71 ma da loc, batch=20 se mat ~4 ngay de
// refresh het 1 vong - danh doi da duoc nguoi dung chap nhan.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface UniverseEntryFull {
  ticker: string;
  sector: string | null;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  lastScannedAt: Date;
}

interface MedianSelectEntry {
  ticker: string;
  sector: string | null;
  debtEquity: number | null;
  pe: number | null;
}

const BATCH_SIZE = 20;

export async function GET() {
  try {
    // Lay batch: uu tien ma CHUA TUNG tinh (tier1 null), roi toi ma CU
    // NHAT (lastScannedAt tang dan).
    const batch: UniverseEntryFull[] = await prisma.dividendUniverseEntry.findMany({
      orderBy: [
        { tier1: { sort: "asc", nulls: "first" } },
        { lastScannedAt: "asc" },
      ],
      take: BATCH_SIZE,
    });

    if (batch.length === 0) {
      return NextResponse.json({ scannedAt: new Date().toISOString(), message: "Khong co ma nao trong universe de xu ly (Job 1 chua chay hoac khong co ket qua)." });
    }

    const tickers: string[] = batch.map((b: UniverseEntryFull) => b.ticker);

    const [incomeResults, balanceResults, quotes, eventsResults] = await Promise.all([
      fetchQuarterlyIncomeBatch(tickers),
      fetchQuarterlyBalanceBatch(tickers),
      fetchQuoteBatch(tickers),
      fetchDividendEventsBatch(tickers),
    ]);

    const incomeMap = new Map(incomeResults.map((r) => [r.ticker, r]));
    const balanceMap = new Map(balanceResults.map((r) => [r.ticker, r]));
    const eventsMap = new Map(eventsResults.map((r) => [r.ticker, r]));

    type RawMetrics = { ticker: string; debtEquity: number | null; pe: number | null; price: number | null };
    const rawByTicker: RawMetrics[] = tickers.map((ticker: string) => {
      const income = incomeMap.get(ticker);
      const balance = balanceMap.get(ticker);
      const quote = quotes[ticker];

      const last4 = income?.available ? income.quarters.slice(0, 4) : [];
      const hasFull4 = last4.length === 4;
      const epsTTM = hasFull4 ? last4.reduce((s, q) => s + (q.eps ?? 0), 0) : null;

      const latestBalance = balance?.available ? balance.quarters[0] : null;
      const totalEquity = latestBalance?.totalEquity ?? null;
      const totalLiabilities = latestBalance?.totalLiabilities ?? null;
      const debtEquity = totalLiabilities !== null && totalEquity ? totalLiabilities / totalEquity : null;

      const price = quote?.price ?? null;
      const pe = price !== null && epsTTM !== null && epsTTM > 0 ? price / epsTTM : null;

      return { ticker, debtEquity, pe, price };
    });

    // Trung vi NGANH: doc CA CAC MA DA TINH TRUOC DO (tu DB, cac batch
    // ngay khac) + batch MOI nay, de trung vi CHINH XAC dan theo thoi
    // gian (lan dau chay se chi co it du lieu, chap nhan duoc).
    const allEntriesForMedian: MedianSelectEntry[] = await prisma.dividendUniverseEntry.findMany({
      select: { ticker: true, sector: true, debtEquity: true, pe: true },
    });
    const mergedForMedian = allEntriesForMedian.map((e: MedianSelectEntry) => {
      const fresh = rawByTicker.find((r: RawMetrics) => r.ticker === e.ticker);
      return { sector: e.sector ?? "Khac", debtEquity: fresh?.debtEquity ?? e.debtEquity, pe: fresh?.pe ?? e.pe };
    });
    type MergedMedianEntry = { sector: string; debtEquity: number | null; pe: number | null };
    const sectorGroups = new Map<string, MergedMedianEntry[]>();
    mergedForMedian.forEach((r: MergedMedianEntry) => {
      const list = sectorGroups.get(r.sector) ?? [];
      list.push(r);
      sectorGroups.set(r.sector, list);
    });
    const marketMedianDebtEquity = calculateMedian(mergedForMedian.map((r: MergedMedianEntry) => r.debtEquity));
    const marketMedianPe = calculateMedian(mergedForMedian.map((r: MergedMedianEntry) => r.pe));
    const industryMedianDebtEquity = new Map<string, number | null>();
    const industryMedianPe = new Map<string, number | null>();
    sectorGroups.forEach((list: MergedMedianEntry[], sector: string) => {
      const hasEnough = list.length >= 2;
      industryMedianDebtEquity.set(sector, hasEnough ? calculateMedian(list.map((r: MergedMedianEntry) => r.debtEquity)) : marketMedianDebtEquity);
      industryMedianPe.set(sector, hasEnough ? calculateMedian(list.map((r: MergedMedianEntry) => r.pe)) : marketMedianPe);
    });

    // Tinh Tier 1-3 + cap nhat DB cho tung ma trong batch
    for (const entry of batch) {
      const raw = rawByTicker.find((r) => r.ticker === entry.ticker);
      if (!raw) continue;

      const income = incomeMap.get(entry.ticker);
      const events = eventsMap.get(entry.ticker);
      const lifecycle = events?.available ? buildLifecycleEvents(entry.ticker, events.rawEvents) : [];
      const cashEvents = lifecycle.filter((e) => e.eventType === "CASH");
      const latestCash = cashEvents[0] ?? null;
      const previousCash = cashEvents[1] ?? null;

      const last4 = income?.available ? income.quarters.slice(0, 4) : [];
      const hasFull4 = last4.length === 4;
      const epsTTM = hasFull4 ? last4.reduce((s, q) => s + (q.eps ?? 0), 0) : null;

      const payoutRatioPct = latestCash?.valuePerShare && epsTTM && epsTTM > 0 ? (latestCash.valuePerShare / epsTTM) * 100 : null;
      const consecutiveYears = cashEvents.length > 0 ? calculateConsecutiveYears(lifecycle) : null;
      const sector = entry.sector ?? "Khac";

      const tier1 = calculateTier1Score({
        payoutRatioPct, consecutiveYears,
        debtEquity: raw.debtEquity,
        industryMedianDebtEquity: industryMedianDebtEquity.get(sector) ?? null,
      });

      const growthResult = income?.available ? calculateEarningsGrowth(entry.ticker, income.quarters) : null;
      const hasRedFlag = detectDividendRedFlag(growthResult?.profitGrowthYoY ?? null, latestCash?.valuePerShare ?? null, previousCash?.valuePerShare ?? null);
      const tier2 = calculateTier2Score({ earningsScore: growthResult?.earningsScore ?? null, hasRedFlag });

      const dividendYieldPct = latestCash?.valuePerShare && raw.price ? (latestCash.valuePerShare / raw.price) * 100 : null;
      const tier3 = calculateTier3Score({
        pe: raw.pe, industryMedianPe: industryMedianPe.get(sector) ?? null, dividendYieldPct,
      });

      const parts = [tier1, tier2, tier3].filter((v): v is number => v !== null);
      const overallScoreTier123 = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null;

      await prisma.dividendUniverseEntry.update({
        where: { ticker: entry.ticker },
        data: { tier1, tier2, tier3, overallScoreTier123, price: raw.price, pe: raw.pe, debtEquity: raw.debtEquity, dividendYieldPct },
      });
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      batchSize: batch.length,
      processedTickers: tickers,
    });
  } catch (err) {
    console.error("[cron/dividend-universe-score] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Quality Score lúc này." }, { status: 500 });
  }
}
