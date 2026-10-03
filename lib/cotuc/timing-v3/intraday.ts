// Giá TRONG PHIÊN cho bộ máy quyết định (quét liên tục): Market Gateway /quotes (SSI) + /indices/VNINDEX.
// Chuỗi tổng lợi suất điều chỉnh LÙI nên phiên mới nhất luôn = giá danh nghĩa -> thêm phiên hôm nay bằng giá khớp hiện tại.
// CHỈ dùng cho ảnh chụp quyết định (CAR hiện tại, chế độ thị trường). Chấm kết quả theo dõi tín hiệu vẫn dùng giá đóng cửa.
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export interface PricePoint { date: string; adjClose: number }
export interface LiveQuote { price: number; date: string }

/** Hàm thuần: thêm (hoặc thay) phiên `q.date` vào cuối chuỗi nếu mới hơn/ bằng phiên cuối. */
export function appendIntradayBar(series: PricePoint[], q: LiveQuote | null | undefined): PricePoint[] {
  if (!q || !(q.price > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(q.date)) return series;
  const last = series[series.length - 1];
  if (!last || q.date > last.date) return [...series, { date: q.date, adjClose: q.price }];
  if (q.date === last.date) return [...series.slice(0, -1), { date: q.date, adjClose: q.price }];
  return series;
}

/** Giá khớp hiện tại của nhiều mã (một request). Lỗi -> Map rỗng (quyết định vẫn tính bằng giá đóng cửa). */
export async function fetchLiveQuotes(symbols: string[], { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<Map<string, LiveQuote>> {
  const out = new Map<string, LiveQuote>();
  for (let i = 0; i < symbols.length; i += 50) {
    try {
      const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/quotes?symbols=${symbols.slice(i, i + 50).join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const body = await res.json() as { quotes?: Record<string, { price?: number; time?: string }> };
      for (const [sym, q] of Object.entries(body.quotes ?? {})) {
        const date = q.time?.slice(0, 10);
        if (typeof q.price === "number" && q.price > 0 && date) out.set(sym, { price: q.price, date });
      }
    } catch { /* bỏ qua lô lỗi */ }
  }
  return out;
}

export async function fetchLiveIndex(code = "VNINDEX", { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<LiveQuote | null> {
  try {
    const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/indices/${code}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const b = await res.json() as { value?: number; date?: string };
    return typeof b.value === "number" && b.value > 0 && b.date ? { price: b.value, date: b.date } : null;
  } catch {
    return null;
  }
}
