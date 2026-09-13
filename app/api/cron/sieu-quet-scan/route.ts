import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { fetchQuarterlyBalanceBatch } from "@/lib/cotuc/vci-balance-sheet-adapter";
import { fetchQuoteBatch, fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchIndexOhlcvHistory } from "@/lib/market-data/vndirect-adapter";
import { calculateSMA, calculateRSI, calculateMACDHistogram, calculateAtrSeries } from "@/lib/market-data/technical-indicators";
import { computeTrendBias, computeMaAlignmentScore, computeImpulseScore, computeConfluence } from "@/lib/sieu-quet-ai/confluence-engine";
import { computeFaScore, computeTaScore, computeEventImpactScore, computeSmartScore, computeRiskReward, computeRiskAdjustedMomentum, type ActiveEvent } from "@/lib/sieu-quet-ai/scoring-engine";
import { computeTrendTag, computeQualityTag, computeRsRating, computeReturnOverPeriod } from "@/lib/sieu-quet-ai/market-tags";
import { calculateFScoreLite } from "@/lib/cotuc/dividend-quality-score";

// SIEU QUET AI - GIAI DOAN 2: Cron Job tinh Confluence Engine + Scoring
// THAT cho 88 ma (17 + 71 Universe), dung Yahoo OHLCV (TA rieng tung ma)
// + VCI (FA) THAY THE market_sim.py (random-walk gia lap trong ban goc).
// VN-Index THAT tu VNDirect dchart (da xac nhan hoat dong, dung boi 4
// route khac trong du an: vnindex-value-estimate, liquidity-1030,
// indices-compare, ohlcv) - KHONG suy dien tu trung binh gia cac ma.
//
// MO RONG UNIVERSE (Top 200 tu TradingView) + VONG XOAY: voi ~275+ ma
// (75 goc + Top 200), khong the tinh trong 1 lan (gioi han 60s Hobby).
// HAN CHE CAN LUU Y: RS Rating (percentile rank) tinh SO VOI BATCH HIEN
// TAI (toi da 100 ma/lan), KHONG PHAI toan bo universe - se "troi" nhe
// giua cac lan chay cho toi khi TAT CA cac batch duoc tinh du 1 vong.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const universeEntries = await prisma.dividendUniverseEntry.findMany({ select: { ticker: true, sector: true } });
    const dividendSectorMap = new Map(DIVIDEND_STOCKS.map((s) => [s.ticker, s.sector]));
    interface UniverseTickerSector { ticker: string; sector: string | null; }
    const allTickerSectors = new Map<string, string>([
      ...(universeEntries as UniverseTickerSector[]).map((e): [string, string] => [e.ticker, e.sector ?? "Khac"]),
      ...Array.from(dividendSectorMap.entries()),
    ]);

    // MO RONG UNIVERSE: hop nhat voi Top 200 (TradingView Scanner, da
    // xac nhan hoat dong that) - loai trung voi danh sach 75 ma da co,
    // giu nguyen sector cua danh sach cu (uu tien) neu trung ma.
    interface Top200Row { ticker: string; sector: string | null; }
    const top200: Top200Row[] = await prisma.sieuQuetUniverseTicker.findMany({ select: { ticker: true, sector: true } });
    for (const t of top200) {
      if (!allTickerSectors.has(t.ticker)) {
        allTickerSectors.set(t.ticker, t.sector ?? "Khac");
      }
    }

    // VONG XOAY: voi ~200+ ma, khong the tinh het trong 1 lan (gioi han
    // 60s Hobby) - uu tien ma CHUA duoc tinh GAN DAY NHAT (computedAt
    // cu nhat truoc), moi lan xu ly toi da BATCH_SIZE ma.
    const BATCH_SIZE = 100;
    const existingScores = await prisma.sieuQuetStockItem.findMany({ select: { ticker: true, computedAt: true } });
    interface ScoredRow { ticker: string; computedAt: Date; }
    const lastComputedMap = new Map((existingScores as ScoredRow[]).map((s) => [s.ticker, s.computedAt.getTime()]));
    const allTickersSorted = Array.from(allTickerSectors.keys()).sort(
      (a, b) => (lastComputedMap.get(a) ?? 0) - (lastComputedMap.get(b) ?? 0)
    );
    const tickers = allTickersSorted.slice(0, BATCH_SIZE);

    // Buoc 1: lay OHLCV (1 nam, du cho MA200 + RS 64 phien) + VCI Income/Balance cho batch ma nay
    const [ohlcvResults, incomeResults, balanceResults, quotes] = await Promise.all([
      Promise.allSettled(tickers.map((t) => fetchOhlcvHistory(t, "1y"))),
      fetchQuarterlyIncomeBatch(tickers),
      fetchQuarterlyBalanceBatch(tickers),
      fetchQuoteBatch(tickers),
    ]);

    const incomeMap = new Map(incomeResults.map((r) => [r.ticker, r]));
    const balanceMap = new Map(balanceResults.map((r) => [r.ticker, r]));

    interface TickerData {
      ticker: string; closes: number[]; ma20: number; ma50: number; ma200: number | null;
      rsi: number; atrPct: number; roe: number; netMargin: number; revenueGrowth: number;
      leverage: number; currentAssets: number; currentLiabilities: number; liquidity: number;
      price: number; changePct: number; return64d: number;
    }

    const tickerData: TickerData[] = [];
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const ohlcvR = ohlcvResults[i];
      if (ohlcvR.status !== "fulfilled" || !ohlcvR.value.success || !ohlcvR.value.data) continue;
      const bars = ohlcvR.value.data;
      const closes = bars.map((b) => b.adjClose);
      if (closes.length < 50) continue; // can toi thieu du lieu cho MA50

      const ma20 = calculateSMA(closes, 20);
      const ma50 = calculateSMA(closes, 50);
      const ma200 = closes.length >= 200 ? calculateSMA(closes, 200) : null;
      const rsi = calculateRSI(closes) ?? 50;
      const atrSeries = calculateAtrSeries(bars as any, 14);
      const atrPct = atrSeries.length > 0
        ? (atrSeries.filter((v) => v <= atrSeries[atrSeries.length - 1]).length / atrSeries.length) * 100
        : 50;

      const income = incomeMap.get(ticker);
      const balance = balanceMap.get(ticker);
      const incomeQ0 = income?.available ? income.quarters[0] : null;
      const balanceQ0 = balance?.available ? balance.quarters[0] : null;
      const incomeQ4Ago = income?.available ? income.quarters[3] : null; // 1 nam truoc (cung ky) cho revenue growth

      const roe = incomeQ0?.netProfit && balanceQ0?.totalEquity ? incomeQ0.netProfit / balanceQ0.totalEquity : 0;
      const netMargin = incomeQ0?.netProfit && incomeQ0?.revenue ? incomeQ0.netProfit / incomeQ0.revenue : 0;
      const revenueGrowth = incomeQ0?.revenue && incomeQ4Ago?.revenue ? incomeQ0.revenue / incomeQ4Ago.revenue - 1 : 0;
      const leverage = balanceQ0?.totalLiabilities && balanceQ0?.totalEquity ? balanceQ0.totalLiabilities / balanceQ0.totalEquity : 1;

      const price = quotes[ticker]?.price ?? closes[closes.length - 1];
      const changePct = closes.length >= 2 ? Math.round((price / closes[closes.length - 2] - 1) * 10000) / 100 : 0;
      const return64d = computeReturnOverPeriod(closes, 64);

      tickerData.push({
        ticker, closes, ma20: ma20 ?? price, ma50: ma50 ?? price, ma200,
        rsi, atrPct, roe, netMargin, revenueGrowth, leverage,
        currentAssets: balanceQ0?.currentAssets ?? 0, currentLiabilities: balanceQ0?.currentLiabilities ?? 0,
        liquidity: bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, bars.length),
        price, changePct, return64d,
      });
    }

    if (tickerData.length === 0) {
      return NextResponse.json({ error: "Không lấy được dữ liệu cho mã nào." }, { status: 500 });
    }

    // Buoc 2: lay VN-INDEX THAT tu VNDirect dchart (da xac nhan hoat
    // dong tot trong du an - dung boi 4 route khac: vnindex-value-
    // estimate, liquidity-1030, indices-compare, ohlcv). KHONG suy dien
    // tu trung binh gia cac ma theo doi nhu ban truoc.
    const vnIndexResult = await fetchIndexOhlcvHistory("VNINDEX", 250);
    if (!vnIndexResult.success || !vnIndexResult.data || vnIndexResult.data.length < 50) {
      return NextResponse.json({ error: "Không lấy được dữ liệu VN-Index thật từ VNDirect lúc này." }, { status: 500 });
    }
    const vnIndexBars = vnIndexResult.data;
    const idxCloses = vnIndexBars.map((b) => b.close);
    const idxMa20 = calculateSMA(idxCloses, 20) ?? idxCloses[idxCloses.length - 1];
    const idxMa50 = calculateSMA(idxCloses, 50) ?? idxCloses[idxCloses.length - 1];
    const idxMa200 = idxCloses.length >= 200 ? calculateSMA(idxCloses, 200) ?? idxMa50 : idxMa50;
    const idxRsi = calculateRSI(idxCloses) ?? 50;
    const idxMacd = calculateMACDHistogram(idxCloses) ?? 0;

    const breadthPct = Math.round((tickerData.filter((t) => t.closes[t.closes.length - 1] > t.ma20).length / tickerData.length) * 1000) / 10;
    const breadth5dAgoCount = tickerData.filter((t) => {
      const closesUpTo5dAgo = t.closes.slice(0, -5);
      const ma20At5dAgo = calculateSMA(closesUpTo5dAgo, 20);
      return ma20At5dAgo !== null && closesUpTo5dAgo[closesUpTo5dAgo.length - 1] > ma20At5dAgo;
    }).length;
    const breadth5dAgo = Math.round((breadth5dAgoCount / tickerData.length) * 1000) / 10;
    const breadthDrop5d = Math.max(0, breadth5dAgo - breadthPct);
    const deathCrossRecent = idxMa50 < idxMa200 * 1.01 && idxCloses[idxCloses.length - 1] < idxMa50;

    const { bias, label } = computeTrendBias(idxCloses[idxCloses.length - 1], idxMa20, idxMa50, idxMa200, breadthPct, deathCrossRecent, breadthDrop5d);
    const maAlign = computeMaAlignmentScore(idxMa20, idxMa50, idxMa200);
    const idxAtrSeries = calculateAtrSeries(vnIndexBars.map((b) => ({ ...b, adjClose: b.close })) as any, 14);
    const idxAtrPct = idxAtrSeries.length > 0 ? (idxAtrSeries.filter((v) => v <= idxAtrSeries[idxAtrSeries.length - 1]).length / idxAtrSeries.length) * 100 : 50;
    const impulseScore = computeImpulseScore(idxRsi, breadthPct, maAlign, idxAtrPct);
    const breakoutProbability = Math.max(0, 100 - idxAtrPct - Math.abs(50 - breadthPct));

    // FIX QUAN TRONG: KHONG dung support/resist cua VN-Index (don vi
    // diem chi so, ~1700-1800) de tinh Risk/Reward cho GIA CO PHIEU
    // (don vi VND, ~20000-250000) - sai don vi hoan toan, gay R/R luon
    // ~-1 cho MOI ma (da phat hien qua du lieu that). Risk/Reward CAN
    // dung vung ho tro/khang cu CUA CHINH TUNG MA (dua tren gia rieng
    // cua ma do), khong phai dung chung 1 muc cua index.

    await prisma.sieuQuetIndexState.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton", asOf: new Date(), ma20: idxMa20, ma50: idxMa50, ma200: idxMa200,
        maAlignmentScore: maAlign, trendBias: bias, trendLabel: label, rsi14: idxRsi, macdHistogram: idxMacd,
        marketBreadthPct: breadthPct, divergence: idxRsi < 45 && idxCloses[idxCloses.length - 1] > idxCloses[idxCloses.length - 10] ? "bearish" : "none",
        atr14: idxAtrSeries[idxAtrSeries.length - 1] ?? 0, atrPercentile: idxAtrPct, breakoutProbability, impulseScore,
        narrative: `VN-Index đang ở trạng thái '${label}' (bias=${bias}), breadth ${breadthPct}%, RSI14=${idxRsi.toFixed(1)}. Impulse Score=${impulseScore}/100.`,
      },
      update: {
        asOf: new Date(), ma20: idxMa20, ma50: idxMa50, ma200: idxMa200,
        maAlignmentScore: maAlign, trendBias: bias, trendLabel: label, rsi14: idxRsi, macdHistogram: idxMacd,
        marketBreadthPct: breadthPct, divergence: idxRsi < 45 && idxCloses[idxCloses.length - 1] > idxCloses[idxCloses.length - 10] ? "bearish" : "none",
        atr14: idxAtrSeries[idxAtrSeries.length - 1] ?? 0, atrPercentile: idxAtrPct, breakoutProbability, impulseScore,
        narrative: `VN-Index đang ở trạng thái '${label}' (bias=${bias}), breadth ${breadthPct}%, RSI14=${idxRsi.toFixed(1)}. Impulse Score=${impulseScore}/100.`,
      },
    });

    // Buoc 3: FA universe (percentile rank) + tinh tung ma
    const faUniverse = {
      roe: tickerData.map((t) => t.roe), margin: tickerData.map((t) => t.netMargin),
      growth: tickerData.map((t) => t.revenueGrowth), liq: tickerData.map((t) => t.liquidity),
    };
    const universeReturns64d = tickerData.map((t) => t.return64d);

    // GIAI DOAN 3: lay su kien DA XAC NHAN that (verifiedStatus=user_confirmed)
    // - CHI su kien nay moi duoc tham gia eventImpactScore (bat bien bat
    // buoc theo yeu cau Phase 3 goc).
    const confirmedEvents = await prisma.sieuQuetEvent.findMany({ where: { verifiedStatus: "user_confirmed" } });
    const now = new Date();
    interface ConfirmedEventRow {
      verifiedStatus: string; sectors: string[]; magnitude: string; direction: string;
      expectedDurationDays: number | null; createdAt: Date;
    }
    const activeEvents: ActiveEvent[] = (confirmedEvents as ConfirmedEventRow[]).map((e) => {
      const durationDays = e.expectedDurationDays ?? 14;
      const daysSinceCreated = Math.floor((now.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = durationDays - daysSinceCreated;
      const status: "ongoing" | "upcoming" | "resolved" = daysRemaining < 0 ? "resolved" : daysSinceCreated <= 1 ? "upcoming" : "ongoing";
      return {
        verifiedStatus: e.verifiedStatus, sectors: e.sectors,
        magnitude: e.magnitude as "high" | "medium" | "low",
        direction: e.direction as "positive" | "negative",
        status, daysRemaining: daysRemaining >= 0 ? daysRemaining : null,
      };
    });

    let processed = 0;
    for (const t of tickerData) {
      const trendTag = computeTrendTag(t.price, t.ma20, t.ma50);
      const qualityTag = computeQualityTag(t.leverage, t.netMargin);
      const rsRating = computeRsRating(t.return64d, universeReturns64d);
      const divergence = t.rsi < 45 && t.price > t.closes[Math.max(0, t.closes.length - 10)] ? "bearish" : "none";

      const faScore = computeFaScore(t.roe, t.netMargin, t.revenueGrowth, faUniverse.roe, faUniverse.margin, faUniverse.growth);
      const taScore = computeTaScore(rsRating, trendTag, t.liquidity, faUniverse.liq, divergence);
      const eventScore = computeEventImpactScore(allTickerSectors.get(t.ticker) ?? "Khac", activeEvents);

      const confl = computeConfluence(bias, trendTag, rsRating, qualityTag, breakoutProbability);
      const smartScore = computeSmartScore(faScore, taScore, eventScore, confl.boost);
      // Support/Resist RIENG cho tung ma: dung MA50 CUA CHINH MA DO lam
      // tam (+-3%) - KHONG dung gia hien tai lam tam (se luon doi xung,
      // R/R=1 vo nghia cho moi ma). MA50 la muc tham chieu on dinh, gia
      // hien tai co the da lech khoi muc nay (len hoac xuong), tao R/R
      // co y nghia THAT (phan anh vi tri gia so voi vung gia tri).
      const stockSupportMid = t.ma50 * 0.97;
      const stockResistMid = t.ma50 * 1.03;
      const riskReward = computeRiskReward(t.price, stockSupportMid, stockResistMid);
      const riskAdjMomentum = computeRiskAdjustedMomentum(t.closes);

      // F-Score rut gon 6/9 (tai dung tu Tab Co Tuc - xem ghi chu trong dividend-quality-score.ts)
      const income = incomeMap.get(t.ticker);
      const balance = balanceMap.get(t.ticker);
      const incomeQ0 = income?.available ? income.quarters[0] : null;
      const incomeQ4 = income?.available ? income.quarters[4] : null;
      const balanceQ0 = balance?.available ? balance.quarters[0] : null;
      const balanceQ4 = balance?.available ? balance.quarters[4] : null;
      const fScoreResult = calculateFScoreLite(
        {
          netProfit: incomeQ0?.netProfit ?? null, totalAssets: balanceQ0?.totalAssets ?? null,
          longTermDebt: balanceQ0?.longTermDebt ?? null, currentAssets: balanceQ0?.currentAssets ?? null,
          currentLiabilities: balanceQ0?.currentLiabilities ?? null, revenue: incomeQ0?.revenue ?? null,
          grossProfit: incomeQ0?.grossProfit ?? null,
        },
        incomeQ4 && balanceQ4 ? {
          netProfit: incomeQ4.netProfit, totalAssets: balanceQ4.totalAssets,
          longTermDebt: balanceQ4.longTermDebt, currentAssets: balanceQ4.currentAssets,
          currentLiabilities: balanceQ4.currentLiabilities, revenue: incomeQ4.revenue, grossProfit: incomeQ4.grossProfit,
        } : null
      );

      await prisma.sieuQuetStockItem.upsert({
        where: { ticker: t.ticker },
        create: {
          ticker: t.ticker, sector: allTickerSectors.get(t.ticker) ?? null,
          price: t.price, changePct: t.changePct, faScore, taScore, eventImpactScore: eventScore, smartScore,
          rsRating, riskAdjustedMomentum: riskAdjMomentum, riskRewardRatio: riskReward,
          trendTag, qualityTag,
          confluenceStatusCode: confl.statusCode, confluenceStatusLabel: confl.statusLabel,
          confluenceBoost: confl.boost, confluenceReasonCodes: confl.reasonCodes, breakoutBoostBadge: confl.breakoutBoostBadge,
          piotroskiFScore: fScoreResult.score, fScoreMax: fScoreResult.maxScore,
        },
        update: {
          sector: allTickerSectors.get(t.ticker) ?? null,
          price: t.price, changePct: t.changePct, faScore, taScore, eventImpactScore: eventScore, smartScore,
          rsRating, riskAdjustedMomentum: riskAdjMomentum, riskRewardRatio: riskReward,
          trendTag, qualityTag,
          confluenceStatusCode: confl.statusCode, confluenceStatusLabel: confl.statusLabel,
          confluenceBoost: confl.boost, confluenceReasonCodes: confl.reasonCodes, breakoutBoostBadge: confl.breakoutBoostBadge,
          piotroskiFScore: fScoreResult.score, fScoreMax: fScoreResult.maxScore,
        },
      });
      processed++;
    }

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      totalTickers: tickers.length,
      processedTickers: processed,
      indexState: { bias, label, breadthPct, impulseScore },
    });
  } catch (err) {
    console.error("[cron/sieu-quet-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét Siêu Quét AI lúc này." }, { status: 500 });
  }
}
