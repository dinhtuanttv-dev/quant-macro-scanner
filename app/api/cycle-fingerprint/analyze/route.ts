import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses, calculateAtrSeries, detectMarketRegime } from "@/lib/market-data/technical-indicators";
import { findTopKCycles, computeQualityScore, computeSummaryStats } from "@/lib/cycle-fingerprint/cycle-scanner";

// GIAI DOAN 1 (Top-K Similarity, quet TRONG CHINH LICH SU cua ma dang xem)
// - Yahoo Finance 5 nam du lieu + DTW thuan TypeScript. Chua co: quet cheo
// nhieu ma (cross-market), phan cum HDBSCAN, Monte Carlo, xac nhan da tin
// hieu - da thong nhat pham vi voi nguoi dung, se lam o Giai doan sau.
export const maxDuration = 30;

const MIN_WINDOW = 10;
const MAX_WINDOW = 90;
const DEFAULT_WINDOW = 30;
const HISTORY_RANGE = "5y";

function toTicker(rawTicker: string): string {
  // Chuyen ma VN sang dung dinh dang Yahoo Finance da dung xuyen suot backend
  return rawTicker.toUpperCase().endsWith(".VN") ? rawTicker.toUpperCase() : `${rawTicker.toUpperCase()}.VN`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawTicker = searchParams.get("ticker");
  const windowParam = searchParams.get("window");
  const timeframe = searchParams.get("timeframe") ?? "daily";

  if (!rawTicker) {
    return NextResponse.json({ error: "Thieu tham so ticker." }, { status: 400 });
  }

  const windowSize = Math.max(MIN_WINDOW, Math.min(MAX_WINDOW, Number(windowParam) || DEFAULT_WINDOW));

  // GIAI DOAN 1: chi ho tro timeframe "daily" - "weekly"/"monthly" can resample
  // du lieu OHLCV, chua lam o day (danh dau state="insufficient" thay vi bo qua im lang).
  if (timeframe !== "daily") {
    return NextResponse.json({
      ticker: rawTicker, windowSize, timeframe, asOfDate: new Date().toISOString(),
      state: "insufficient",
      priceSeries: [], topMatches: [], cluster: null,
      qualityScore: { similarity: 0, liquidity: 0, regime: 0, sampleSize: 0, overall: 0, warningThreshold: 0.4 },
      summary: { winRatePct: 0, avgReturnPct: 0, maxDrawdownPct: 0, sampleCount: 0 },
      fanChart: [], atrSeries: [],
      note: "Khung thoi gian tuan/thang chua duoc ho tro o Giai doan 1.",
    });
  }

  try {
    const yahooTicker = toTicker(rawTicker);
    const result = await fetchOhlcvHistory(yahooTicker, HISTORY_RANGE);

    if (!result.success || !result.data || result.data.length < windowSize * 2 + 60) {
      return NextResponse.json({
        ticker: rawTicker, windowSize, timeframe, asOfDate: new Date().toISOString(),
        state: "insufficient",
        priceSeries: [], topMatches: [], cluster: null,
        qualityScore: { similarity: 0, liquidity: 0, regime: 0, sampleSize: 0, overall: 0, warningThreshold: 0.4 },
        summary: { winRatePct: 0, avgReturnPct: 0, maxDrawdownPct: 0, sampleCount: 0 },
        fanChart: [], atrSeries: [],
      });
    }

    const bars = result.data;
    const closes = extractCloses(bars);

    const matches = findTopKCycles(bars, windowSize, 5);
    const regimeResult = detectMarketRegime(closes);
    const qualityScore = computeQualityScore(matches, bars, regimeResult.confidence);
    const summary = computeSummaryStats(matches);
    const atrSeries = calculateAtrSeries(bars, 14);

    // priceSeries: hien thi cua so hien tai + 1 doan lich su ngay truoc do de
    // co ngu canh (khong chi dung dung windowSize phien, de nguoi dung thay
    // "gia den tu dau").
    const contextBars = Math.min(bars.length, windowSize * 3);
    const priceSeriesBars = bars.slice(-contextBars);
    const priceSeries = priceSeriesBars.map((b) => ({ date: b.date, close: { value: b.close, source: "HARD_DATA" as const } }));

    const atrSeriesForResponse = atrSeries.slice(-contextBars).map((atr, i) => ({
      sessionOffset: i - (contextBars - 1), atr: { value: Math.round(atr * 100) / 100, source: "HARD_DATA" as const },
    }));

    const topMatches = matches.map((m) => ({
      ticker: rawTicker.toUpperCase(),
      matchStartDate: m.matchStartDate,
      matchEndDate: m.matchEndDate,
      similarityPct: { value: m.similarityPct, source: "HARD_DATA" as const },
      returns: {
        d10: { value: m.returns[10], source: "HARD_DATA" as const },
        d20: { value: m.returns[20], source: "HARD_DATA" as const },
        d30: { value: m.returns[30], source: "HARD_DATA" as const },
        d60: { value: m.returns[60], source: "HARD_DATA" as const },
      },
      alignedSeries: m.alignedSeries.map((pt) => ({
        sessionOffset: pt.sessionOffset, normalizedClose: { value: Math.round(pt.normalizedClose * 100) / 100, source: "HARD_DATA" as const },
      })),
    }));

    return NextResponse.json({
      ticker: rawTicker.toUpperCase(),
      windowSize,
      timeframe,
      asOfDate: new Date().toISOString(),
      state: matches.length > 0 ? "success" : "insufficient",
      priceSeries,
      topMatches,
      cluster: null, // Giai doan sau (HDBSCAN)
      qualityScore: {
        similarity: { value: qualityScore.similarity, source: "HARD_DATA" as const },
        liquidity: { value: qualityScore.liquidity, source: "ESTIMATED" as const },
        regime: { value: qualityScore.regime, source: "ESTIMATED" as const },
        sampleSize: { value: qualityScore.sampleSize, source: "ESTIMATED" as const },
        overall: { value: qualityScore.overall, source: "ESTIMATED" as const },
        warningThreshold: 0.4,
      },
      summary: {
        winRatePct: { value: summary.winRatePct, source: "HARD_DATA" as const },
        avgReturnPct: { value: summary.avgReturnPct, source: "HARD_DATA" as const },
        maxDrawdownPct: { value: summary.maxDrawdownPct, source: "HARD_DATA" as const },
        sampleCount: summary.sampleCount,
      },
      fanChart: [], // Giai doan sau
      atrSeries: atrSeriesForResponse,
    });
  } catch (err) {
    console.error("[cycle-fingerprint/analyze] Loi:", err);
    return NextResponse.json({ error: "Khong phan tich duoc chu ky gia luc nay.", detail: String(err) }, { status: 500 });
  }
}
