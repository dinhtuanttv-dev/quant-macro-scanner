import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * MOCK ROUTE cho Tab "Elite 10" (TA VN-Index) — Frontend.
 * TODO (Backend): thay bằng SMC/Wyckoff/Elliott/ADX/Pattern Scanner thật.
 * Hợp đồng dữ liệu: global-quanta/src/types/taVnIndex.ts
 */

function toBusinessDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildOhlcSeries(ticker: string, weeks = 60) {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed % 1000) / 1000; };

  const basePrice = 25000 + (seed % 50000);
  const out: any[] = [];
  let price = basePrice;
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - weeks * 7);

  for (let i = 0; i < weeks; i++) {
    const drift = (rand() - 0.48) * 0.04;
    const open = price;
    const close = Math.max(1000, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rand() * 0.02);
    const low = Math.min(open, close) * (1 - rand() * 0.02);
    const volume = Math.floor(500000 + rand() * 2000000);
    out.push({ time: toBusinessDay(today), open: Math.round(open), high: Math.round(high), low: Math.round(low), close: Math.round(close), volume });
    price = close;
    today.setUTCDate(today.getUTCDate() + 7);
  }
  return out;
}

function buildMockResponse(ticker: string, timeframe: string) {
  const priceSeries = buildOhlcSeries(ticker);
  const lastBar = priceSeries[priceSeries.length - 1];
  const lastClose = lastBar?.close ?? 30000;
  const dzBar = priceSeries[5] ?? lastBar;

  return {
    ticker,
    timeframe: (timeframe || "W"),
    asOfDate: new Date().toISOString().slice(0, 10),
    priceSeries,
    trendline: [
      { time: priceSeries[10]?.time, value: priceSeries[10]?.low ?? lastClose * 0.9 },
      { time: priceSeries[40]?.time, value: priceSeries[40]?.low ?? lastClose * 0.95 },
    ],
    events: [
      { time: priceSeries[20]?.time, type: "T", label: "Catalyst mock", priceAtEvent: { value: priceSeries[20]?.close ?? lastClose, source: "HARD_DATA" } },
    ],
    smc: {
      orderBlockCount: 3, fvgCount: 2, bosCount: 1,
      nearestBearishOb: { priceLow: lastClose * 1.05, priceHigh: lastClose * 1.1 },
      zones: [{ id: "dz-mock-1", kind: "demand_zone", priceTop: dzBar.high, priceBottom: dzBar.low, timeFrom: dzBar.time, timeTo: dzBar.time, label: "Demand Zone (mock)" }],
      source: "ESTIMATED",
    },
    vsa: { pattern: "No demand", detail: "Mock — thay bằng VSA thật", source: "ESTIMATED" },
    wyckoff: { phase: "Mark-up", confidence: { value: 62, source: "ESTIMATED" }, regimeGated: false, detail: "Mock — thay bằng Wyckoff thật" },
    elliott: { waveLabel: "Wave 3", confidence: { value: 55, source: "ESTIMATED" }, alternateCounts: 2, regimeGated: false },
    adx: {
      value: { value: 24.5, source: "HARD_DATA" },
      plusDi: { value: 22.1, source: "HARD_DATA" },
      minusDi: { value: 18.7, source: "HARD_DATA" },
      signal: "neutral",
    },
    rsi: { value: { value: 58.3, source: "HARD_DATA" }, signal: { value: "neutral", source: "ESTIMATED" } },
    macd: { value: { value: 120, source: "HARD_DATA" }, signal: { value: 80, source: "HARD_DATA" }, histogram: { value: 40, source: "HARD_DATA" }, label: "Bullish" },
    patternScanner: [
      { ticker, sector: "Mock", patternName: "VCP", geometricMatchPct: { value: 78, source: "HARD_DATA" }, historicalWinRatePct: { value: 64, source: "HARD_DATA" }, dampenedConfidencePct: { value: 70, source: "ESTIMATED" }, isDampened: false },
      { ticker, sector: "Mock", patternName: "Wyckoff Accumulation", geometricMatchPct: { value: 65, source: "HARD_DATA" }, historicalWinRatePct: { value: 58, source: "HARD_DATA" }, dampenedConfidencePct: { value: 55, source: "ESTIMATED" }, isDampened: true },
    ],
    conflicts: [],
    formationCounters: [
      { componentName: "Demand Zone", barsSinceFormation: 8, maturity: "consolidating" },
      { componentName: "Elliott Wave 3", barsSinceFormation: null, maturity: null },
    ],
    confluence: {
      overall: { value: 72, source: "ESTIMATED" },
      sourcesWithData: 6, sourcesTotal: 7,
      sources: [
        { key: "smc", name: "SMC", status: "ok", detail: "3 OB, 2 FVG", weightPct: 18, isCurrentTab: true },
        { key: "wyckoff", name: "Wyckoff", status: "ok", detail: "Mark-up", weightPct: 15, isCurrentTab: false },
        { key: "elliott", name: "Elliott", status: "warn", detail: "2 alternate counts", weightPct: 12, isCurrentTab: false },
        { key: "adx", name: "ADX", status: "ok", detail: "24.5 (trending)", weightPct: 14, isCurrentTab: false },
        { key: "pattern", name: "Pattern", status: "ok", detail: "VCP matched", weightPct: 16, isCurrentTab: false },
        { key: "rsi", name: "RSI", status: "ok", detail: "58.3", weightPct: 10, isCurrentTab: false },
        { key: "foreign", name: "Khối ngoại", status: "no_data", detail: "Chưa có dữ liệu", weightPct: null, isCurrentTab: false },
      ],
      concentrationRiskNote: "Mock — concentration chưa tính",
      weightsConfirmed: false,
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get("ticker") ?? "VNM").toUpperCase();
  const timeframe = searchParams.get("timeframe") ?? "W";
  return NextResponse.json(buildMockResponse(ticker, timeframe));
}
