import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

/**
 * MOCK ROUTE cho Tab "Elite 10" (TA VN-Index) — Frontend.
 * TODO (Backend): thay bằng SMC/Wyckoff/Elliott/ADX/Pattern Scanner thật.
 * Hợp đồng dữ liệu: global-quanta/src/types/taVnIndex.ts
 *
 * ĐÃ SỬA (tích hợp dữ liệu giá thật qua vnstock, giữ nguyên phần phân tích mock):
 *  1. `priceSeries` giờ gọi thật từ /api/stock (FastAPI + vnstock) khi thành
 *     công — KHÔNG còn sinh giả bằng buildOhlcSeries() trong trường hợp này.
 *  2. QUAN TRỌNG: KHÔNG gộp chung 1 cờ `isMock` cho cả priceSeries lẫn các
 *     field phân tích (smc/wyckoff/elliott/adx/rsi/macd/patternScanner) —
 *     những field đó VẪN LÀ MOCK (hardcode) dù priceSeries đã thật, nên
 *     tách riêng `analysisIsMock: true` để không ai hiểu nhầm RSI=58.3 hay
 *     ADX=24.5 là tính từ giá thật (chúng KHÔNG PHẢI). Chỉ số thật (SMA/EMA/
 *     RSI/Bollinger) nằm ở field `computedIndicators` mới, tính bởi
 *     api/stock.py trực tiếp trên priceSeries thật.
 *  3. Nếu gọi /api/stock thất bại (mạng lỗi, vnstock rate-limit, mã không
 *     tồn tại...), fallback về priceSeries mock NHƯ CŨ, giữ `isMock: true`
 *     và ghi rõ `fallbackReason` — không bao giờ để lỗi khiến response
 *     trông giống dữ liệu thật.
 */

function toBusinessDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const TIMEFRAME_CONFIG: Record<string, { dayStep: number; bars: number }> = {
  D: { dayStep: 1, bars: 500 },
  W: { dayStep: 7, bars: 120 },
  M: { dayStep: 30, bars: 36 },
};

function buildOhlcSeries(ticker: string, timeframe: string) {
  const config = TIMEFRAME_CONFIG[timeframe] ?? TIMEFRAME_CONFIG.W;
  const { dayStep, bars } = config;

  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = (seed * 31 + ticker.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed % 1000) / 1000; };

  const basePrice = 25000 + (seed % 50000);
  const out: any[] = [];
  let price = basePrice;
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - bars * dayStep);

  for (let i = 0; i < bars; i++) {
    const drift = (rand() - 0.48) * 0.04;
    const open = price;
    const close = Math.max(1000, open * (1 + drift));
    const high = Math.max(open, close) * (1 + rand() * 0.02);
    const low = Math.min(open, close) * (1 - rand() * 0.02);
    const volume = Math.floor(500000 + rand() * 2000000);
    out.push({ time: toBusinessDay(today), open: Math.round(open), high: Math.round(high), low: Math.round(low), close: Math.round(close), volume });
    price = close;
    today.setUTCDate(today.getUTCDate() + dayStep);
  }
  return out;
}

/** Gọi api/stock.py (FastAPI + vnstock) để lấy priceSeries THẬT. Ném lỗi nếu thất bại — caller phải tự fallback. */
async function fetchRealPriceSeries(origin: string, ticker: string, timeframe: string) {
  const url = `${origin}/api/stock?symbol=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}`;
  const res = await fetch(url, {
    // Next.js Data Cache: dữ liệu EOD không cần fetch lại mỗi request,
    // revalidate mỗi 10 phút là đủ, giảm tải lên vnstock (tránh rate-limit
    // 20 req/phút của tier Guest).
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`api/stock trả lỗi ${res.status}: ${body.detail ?? "không rõ nguyên nhân"}`);
  }
  return res.json();
}

function buildMockResponse(ticker: string, timeframe: string) {
  const priceSeries = buildOhlcSeries(ticker, timeframe);
  const lastBar = priceSeries[priceSeries.length - 1];
  const lastClose = lastBar?.close ?? 30000;
  const dzBar = priceSeries[5] ?? lastBar;

  return {
    ticker,
    timeframe: (timeframe || "W"),
    asOfDate: new Date().toISOString().slice(0, 10),
    isMock: true,
    // MỚI: cờ riêng cho khối phân tích (smc/wyckoff/.../patternScanner bên
    // dưới) — LUÔN true ở bản này, độc lập với priceSeries thật hay giả.
    analysisIsMock: true,
    priceSeries,
    computedIndicators: null, // chỉ có khi priceSeries là thật (xem GET handler)
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

  const mock = buildMockResponse(ticker, timeframe);

  try {
    const real = await fetchRealPriceSeries(req.nextUrl.origin, ticker, timeframe);
    return NextResponse.json({
      ...mock,
      priceSeries: real.priceSeries,
      computedIndicators: real.computedIndicators,
      isMock: false, // priceSeries giờ thật
      priceDataSource: "vnstock",
      barCount: real.barCount,
      // analysisIsMock vẫn giữ nguyên true từ `mock` — smc/wyckoff/... chưa đổi
    });
  } catch (err) {
    console.error(`[ta-vn-index/analyze] Không lấy được dữ liệu thật cho ${ticker}, dùng mock:`, err);
    return NextResponse.json({
      ...mock,
      fallbackReason: err instanceof Error ? err.message : String(err),
    });
  }
}
