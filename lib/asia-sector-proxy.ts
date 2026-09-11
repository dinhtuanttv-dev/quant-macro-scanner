// lib/asia-sector-proxy.ts
//
// MUC 3 (Chau A): khac voi My/Au (1 ETF/nganh, thanh khoan cao), Chau A
// KHONG co ETF nganh thong nhat toan khu vuc - dung PHUONG PHAP RO CO
// PHIEU DAU NGANH, tinh trung binh cong (khong trong so von hoa vi Yahoo
// da khoa endpoint quote/marketCap tu 1/2026, chi con endpoint chart -
// xem PHASE2-TODO.md) + LOC OUTLIER bang z-score de tranh 1 co phieu bien
// dong bat thuong (tin tuc rieng cong ty) lam sai lech tin hieu chung
// cua ca nganh.

// Yahoo Finance chart endpoint - CUNG endpoint da dung on dinh cho
// US/EU trong route.ts, tai su dung KHONG tao ket noi rieng.
async function fetchYahooChart(symbol: string, range: string, interval: string) {
  const res = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`,
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

// % thay doi phien hien tai (dung cache "no-store" - can gia MOI NHAT,
// KHONG phai gia da fetch truoc do cho volatility).
async function fetchTodayChangePercent(symbol: string): Promise<number | null> {
  try {
    const json = await fetchYahooChart(symbol, "1d", "1d");
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const price = meta.regularMarketPrice;
    if (!prevClose || !price) return null;
    return ((price - prevClose) / prevClose) * 100;
  } catch {
    return null;
  }
}

// Do lech chuan cua % thay doi hang ngay trong 3 thang gan nhat - dung lam
// "nguong binh thuong" rieng cho TUNG co phieu (co phieu von di volatile
// hon se co nguong cao hon, tranh loai oan co phieu binh thuong da hay
// bien dong manh).
async function fetchHistoricalVolatility(symbol: string): Promise<number | null> {
  try {
    const json = await fetchYahooChart(symbol, "3mo", "1d");
    const closes: number[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes) || closes.length < 10) return null;

    const dailyReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1];
      const curr = closes[i];
      if (typeof prev !== "number" || typeof curr !== "number" || prev === 0) continue;
      dailyReturns.push(((curr - prev) / prev) * 100);
    }
    if (dailyReturns.length < 10) return null;

    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
    return Math.sqrt(variance);
  } catch {
    return null;
  }
}

export interface BasketTickerResult {
  ticker: string;
  changePercent: number | null;
  historicalVolatility: number | null;
  isOutlier: boolean;
  excludedReason?: string;
}

export interface BasketProxyResult {
  changePercent: number | null; // null neu khong con ticker nao hop le sau khi loc
  tickers: BasketTickerResult[];
}

// Nguong z-score de coi la outlier. |z| > 2.5 tuong duong xac suat ~1.2%
// neu phan phoi chuan - du "hiem" de nghi ngo la tin tuc rieng cong ty
// thay vi bien dong nganh binh thuong. Neu chua co du lieu volatility
// (API loi), KHONG loai (tranh loai oan khi thieu thong tin).
const Z_SCORE_OUTLIER_THRESHOLD = 2.5;
const MIN_VOLATILITY_FLOOR = 0.3; // % - tranh chia cho so qua nho gay z-score ao cao bat thuong

export async function computeAsiaBasketProxy(tickers: string[]): Promise<BasketProxyResult> {
  const results: BasketTickerResult[] = await Promise.all(
    tickers.map(async (ticker) => {
      const [changePercent, historicalVolatility] = await Promise.all([
        fetchTodayChangePercent(ticker),
        fetchHistoricalVolatility(ticker),
      ]);

      if (changePercent === null) {
        return { ticker, changePercent: null, historicalVolatility, isOutlier: false, excludedReason: "khong lay duoc gia hom nay" };
      }

      if (historicalVolatility === null || historicalVolatility < MIN_VOLATILITY_FLOOR) {
        // Khong du du lieu volatility -> khong loc, giu lai (tranh loai oan)
        return { ticker, changePercent, historicalVolatility, isOutlier: false };
      }

      const zScore = Math.abs(changePercent) / historicalVolatility;
      const isOutlier = zScore > Z_SCORE_OUTLIER_THRESHOLD;
      return {
        ticker, changePercent, historicalVolatility, isOutlier,
        excludedReason: isOutlier ? `z-score ${zScore.toFixed(2)} vuot nguong ${Z_SCORE_OUTLIER_THRESHOLD} (co the tin tuc rieng cong ty)` : undefined,
      };
    }),
  );

  const validForAverage = results.filter((r) => r.changePercent !== null && !r.isOutlier);

  if (validForAverage.length === 0) {
    return { changePercent: null, tickers: results };
  }

  const avg = validForAverage.reduce((sum, r) => sum + (r.changePercent as number), 0) / validForAverage.length;
  return { changePercent: avg, tickers: results };
}
