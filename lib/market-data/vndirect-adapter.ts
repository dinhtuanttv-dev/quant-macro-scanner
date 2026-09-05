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

export interface IndexQuote {
  symbol: string;
  close: number;
  changeAbs: number;
  changePct: number;
}

/**
 * Lay gia dong cua + % thay doi cho nhieu chi so cung luc, dung
 * chung nguon VNDirect dchart da xac nhan hoat dong tot cho VNINDEX.
 * Symbol dung: VNINDEX, VN30, HNX, UPCOM.
 */
export async function fetchIndicesLatest(symbols: string[]): Promise<Record<string, IndexQuote | null>> {
  const result: Record<string, IndexQuote | null> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      const vndSymbol = symbol === "VNINDEX" ? "VNINDEX" : symbol;
      const res = await fetchIndexOhlcvHistory(vndSymbol, 5);
      if (!res.success || !res.data || res.data.length < 2) {
        result[symbol] = null;
        return;
      }
      const bars = res.data;
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      const changeAbs = last.close - prev.close;
      const changePct = prev.close !== 0 ? (changeAbs / prev.close) * 100 : 0;
      result[symbol] = { symbol, close: last.close, changeAbs, changePct };
    })
  );

  return result;
}

export interface IntradayBar {
  timestamp: number;
  close: number;
  volume: number;
}

/**
 * Lay du lieu intraday (theo phut) cho VNINDEX, dung de tinh thanh
 * khoan luy ke den mot gio cu the (vd 10:30) cho nhieu phien gan day.
 * resolution: "15" (15 phut) la du chi tiet, giam tai request.
 */
export async function fetchIntradayBars(
  symbol: string,
  daysBack: number = 10,
  resolution: string = "15"
): Promise<IntradayBar[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - daysBack * 24 * 60 * 60;
  const url = `${VND_BASE_URL}?resource=stock&symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    cache: "no-store",
  });
  if (!res.ok) return [];

  const json = await res.json();
  if (json?.s !== "ok" || !Array.isArray(json?.t)) return [];

  return json.t.map((ts: number, i: number) => ({
    timestamp: ts,
    close: json.c[i],
    volume: json.v[i],
  }));
}
