// ============================================================
// SSI IBOARD ADAPTER - lay du lieu OHLCV cho CHI SO (vd VNINDEX)
// Yahoo Finance chi ho tro range toi da 5 ngay cho ^VNINDEX.VN,
// khong du de ve bieu do dai han. SSI iBoard public API tra ve
// lich su day du (da test: 62 bars ~3 thang).
// ============================================================

export interface OhlcvBar {
  date: string;
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

const SSI_BASE_URL = "https://iboard-api.ssi.com.vn/statistics/charts/history";

/**
 * Lay lich su OHLCV cho chi so tu SSI iBoard (vd: VNINDEX, HNXINDEX).
 * @param symbol Ma chi so, vd "VNINDEX"
 * @param days So ngay lui ve qua khu (mac dinh 90 ngay)
 */
export async function fetchIndexOhlcvHistory(
  symbol: string,
  days: number = 90
): Promise<FetchResult<OhlcvBar[]>> {
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    const url = `${SSI_BASE_URL}?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://iboard.ssi.com.vn/",
        Origin: "https://iboard.ssi.com.vn",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, data: null, error: `SSI iBoard tra ve HTTP ${res.status} cho ma ${symbol}` };
    }

    const json = await res.json();
    const d = json?.data;

    if (!d || !Array.isArray(d.t) || d.t.length === 0) {
      return { success: false, data: null, error: `SSI iBoard khong co du lieu hop le cho ma ${symbol}` };
    }

    const bars: OhlcvBar[] = d.t.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: d.o[i],
      high: d.h[i],
      low: d.l[i],
      close: d.c[i],
      volume: d.v[i],
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
