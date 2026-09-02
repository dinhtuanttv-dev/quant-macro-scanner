// ============================================================
// VNDIRECT DCHART ADAPTER - lay du lieu OHLCV cho CHI SO (VNINDEX)
// SSI iBoard chan IP datacenter cua Vercel (403). VNDirect dchart
// la endpoint cong khai phuc vu TradingView charting, khong yeu cau
// Referer/Origin dac biet, it bi chan hon.
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

const VND_BASE_URL = "https://dchart-api.vndirect.com.vn/dchart/history";

/**
 * Lay lich su OHLCV cho chi so tu VNDirect dchart (vd: VNINDEX).
 */
export async function fetchIndexOhlcvHistory(
  symbol: string,
  days: number = 90
): Promise<FetchResult<OhlcvBar[]>> {
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    const url = `${VND_BASE_URL}?resource=stock&symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, data: null, error: `VNDirect dchart tra ve HTTP ${res.status} cho ma ${symbol}` };
    }

    const json = await res.json();

    if (json?.s !== "ok" || !Array.isArray(json?.t) || json.t.length === 0) {
      return { success: false, data: null, error: `VNDirect dchart khong co du lieu hop le cho ma ${symbol}` };
    }

    const bars: OhlcvBar[] = json.t.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open: json.o[i],
      high: json.h[i],
      low: json.l[i],
      close: json.c[i],
      volume: json.v[i],
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
