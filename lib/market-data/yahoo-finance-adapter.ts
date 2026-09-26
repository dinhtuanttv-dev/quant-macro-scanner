// ============================================================
// YAHOO FINANCE ADAPTER - lay du lieu gia OHLCV
// Thay the cho TCBS adapter (da ngung hoat dong - endpoint 404).
// Yahoo Finance v8 chart endpoint khong chinh thuc nhung da on
// dinh nhieu nam, ha tang toan cau, it rui ro hon public API VN.
//
// Ma chung khoan VN tren Yahoo dung dang "TICKER.VN", vd:
//   FPT -> FPT.VN, VCB -> VCB.VN, ^VNINDEX.VN cho chi so VN-Index
// ============================================================

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // MO RONG (Timing Engine): adjClose - da XAC NHAN qua doi chieu voi
  // su kien co tuc THAT (VNM dot 2/2025, exrightDate=2026-06-26,
  // valuePerShare=1850): gia TRUOC GDKHQ da duoc Yahoo TU DONG dieu
  // chinh giam dung bang gia tri co tuc (58400 -> adjclose=56546.8),
  // gia TU GDKHQ tro di thi close=adjclose. KHONG CAN tu viet lai logic
  // back-adjust nhu de xuat trong Python script dinh kem.
  adjClose: number;
}

export interface FetchResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

function toYahooSymbol(ticker: string): string {
  const normalized = ticker.trim().toUpperCase();
  if (normalized === "VNINDEX" || normalized === "VN-INDEX") return "^VNINDEX.VN";
  if (ticker.startsWith("^") || ticker.includes(".")) return ticker;
  return `${ticker}.VN`;
}

export async function fetchOhlcvHistory(
  ticker: string,
  range: string = "3mo"
): Promise<FetchResult<OhlcvBar[]>> {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;

    // FIX GOC RE (2026-09-26, xac nhan qua kiem tra thuc te): truoc day
    // fetch() KHONG CO timeout/AbortController - neu Yahoo CHAN/TREO
    // rieng cho 1 ma cu the tu IP datacenter cua Vercel (da xac nhan
    // thuc te: VNM tu may ca nhan nhan phan hoi nhanh (~85KB, binh
    // thuong), nhung tu Vercel server (region hkg1) lai TREO VO THOI
    // HAN, khong phai loi ro rang), request se CHO MAI cho den khi
    // Vercel tu cat o gioi han maxDuration - day la nguyen nhan GOC RE
    // that cua chuoi FUNCTION_INVOCATION_TIMEOUT da gap (KHONG PHAI
    // gioi han Vercel Hobby plan nhu nghi truoc do). Them AbortController
    // 10s: neu Yahoo khong phan hoi kip, THAT BAI NGAY VOI LOI RO RANG
    // thay vi treo vo thoi han - cho phep code goi (VD cron xu ly theo
    // lo) TU BO QUA ma do (skippedCount++) thay vi lam treo CA request.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      return { success: false, data: null, error: `Yahoo Finance tra ve HTTP ${res.status} cho ma ${symbol}` };
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result || !Array.isArray(result.timestamp)) {
      const errMsg = json?.chart?.error?.description ?? "Khong nhan duoc du lieu hop le tu Yahoo Finance";
      return { success: false, data: null, error: `${errMsg} (ma: ${symbol})` };
    }

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const adjcloseArr: number[] | undefined = result.indicators?.adjclose?.[0]?.adjclose;

    if (!quote) {
      return { success: false, data: null, error: "Thieu truong indicators.quote trong response Yahoo" };
    }

    const bars: OhlcvBar[] = timestamps
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: quote.open?.[i],
        high: quote.high?.[i],
        low: quote.low?.[i],
        close: quote.close?.[i],
        volume: quote.volume?.[i],
        adjClose: adjcloseArr?.[i] ?? quote.close?.[i], // fallback ve close neu Yahoo thieu adjclose
      }))
      .filter((bar) => bar.close !== null && bar.close !== undefined && !Number.isNaN(bar.close));

    return { success: true, data: bars };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      data: null,
      error: isTimeout ? "Yahoo Finance khong phan hoi trong 10s (timeout)" : err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchLatestCloseBatch(
  tickers: string[]
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};

  for (const ticker of tickers) {
    const res = await fetchOhlcvHistory(ticker, "5d");
    if (res.success && res.data && res.data.length > 0) {
      result[ticker] = res.data[res.data.length - 1].close;
    } else {
      result[ticker] = null;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}

export interface YahooQuote {
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  error?: string;
}

export async function fetchQuote(ticker: string): Promise<YahooQuote> {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return { price: null, change: null, changePct: null, previousClose: null, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) {
      return { price: null, change: null, changePct: null, previousClose: null, error: "Khong co du lieu" };
    }
    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price !== null && previousClose !== null ? price - previousClose : null;
    const changePct = change !== null && previousClose ? (change / previousClose) * 100 : null;
    return { price, change, changePct, previousClose };
  } catch (err) {
    return { price: null, change: null, changePct: null, previousClose: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchQuoteBatch(tickers: string[]): Promise<Record<string, YahooQuote>> {
  const result: Record<string, YahooQuote> = {};
  const BATCH_SIZE = 15;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((t) => fetchQuote(t)));
    batch.forEach((ticker, idx) => { result[ticker] = batchResults[idx]; });
  }
  return result;
}
