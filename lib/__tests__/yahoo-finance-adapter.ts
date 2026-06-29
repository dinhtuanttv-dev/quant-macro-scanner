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
  date: string; // ISO yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FetchResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

const YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Doi ma VN sang dinh dang Yahoo. Da co .VN thi giu nguyen. */
function toYahooSymbol(ticker: string): string {
  if (ticker.startsWith("^") || ticker.includes(".")) return ticker;
  return `${ticker}.VN`;
}

/**
 * Lay lich su gia OHLCV cho 1 ma chung khoan tu Yahoo Finance.
 * @param ticker Ma chung khoan, vd "FPT", "VCB", hoac "^VNINDEX.VN" cho chi so
 * @param range Khoang thoi gian Yahoo ho tro: "1mo","3mo","6mo","1y","2y","5y"
 */
export async function fetchOhlcvHistory(
  ticker: string,
  range: string = "3mo"
): Promise<FetchResult<OhlcvBar[]>> {
  try {
    const symbol = toYahooSymbol(ticker);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });

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
      }))
      // Yahoo co the tra ve null cho 1 vai phien (ngay nghi, du lieu thieu) -> loai bo
      .filter((bar) => bar.close !== null && bar.close !== undefined && !Number.isNaN(bar.close));

    return { success: true, data: bars };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Lay gia dong cua moi nhat cho nhieu ma cung luc.
 * Goi tuan tu (khong Promise.all) de tranh bi Yahoo rate-limit,
 * cach nhau 1 khoang nho de lich su.
 */
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
    // Nghi ngan giua cac request de giam rui ro rate-limit
    await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}