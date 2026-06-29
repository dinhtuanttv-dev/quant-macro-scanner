// ============================================================
// TCBS ADAPTER - lay du lieu gia OHLCV tu TCBS public API
// Khong can API key. Endpoint nay duoc nhieu thu vien cong dong
// (vnstock, vn-stock-sdk) xac nhan su dung on dinh nhieu nam.
//
// LUU Y RUI RO: day la public API khong chinh thuc (TCBS khong
// cam ket SLA cho ben thu 3). Co the bi doi cau truc bat ky luc
// nao. Module nay duoc tach rieng (Modular) de khi TCBS doi API,
// chi can sua file nay, khong anh huong code goi no.
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

const TCBS_BASE_URL = "https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term";

/**
 * Lay lich su gia OHLCV cho 1 ma chung khoan.
 * @param ticker Ma chung khoan, vd "FPT", "VCB"
 * @param days So ngay lui ve qua khu (mac dinh 90 ngay)
 */
export async function fetchOhlcvHistory(
  ticker: string,
  days: number = 90
): Promise<FetchResult<OhlcvBar[]>> {
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    const url = `${TCBS_BASE_URL}?ticker=${encodeURIComponent(ticker)}&type=stock&resolution=D&from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroScanner/1.0)" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, data: null, error: `TCBS tra ve HTTP ${res.status}` };
    }

    const json = await res.json();
    const rawBars = json?.data;

    if (!Array.isArray(rawBars)) {
      return { success: false, data: null, error: "Cau truc response TCBS khong dung dinh dang mong doi" };
    }

    const bars: OhlcvBar[] = rawBars.map((bar: any) => ({
      date: new Date(bar.tradingDate ?? bar.t * 1000).toISOString().slice(0, 10),
      open: Number(bar.open ?? bar.o),
      high: Number(bar.high ?? bar.h),
      low: Number(bar.low ?? bar.l),
      close: Number(bar.close ?? bar.c),
      volume: Number(bar.volume ?? bar.v),
    }));

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
 * Goi tuan tu (khong Promise.all) de tranh bi TCBS rate-limit.
 */
export async function fetchLatestCloseBatch(
  tickers: string[]
): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {};

  for (const ticker of tickers) {
    const res = await fetchOhlcvHistory(ticker, 5);
    if (res.success && res.data && res.data.length > 0) {
      result[ticker] = res.data[res.data.length - 1].close;
    } else {
      result[ticker] = null;
    }
  }

  return result;
}