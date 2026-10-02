// Nguồn giá CHÍNH cho Timing Engine cổ tức: SSI qua Market Gateway (Railway) —
// GET /api/market/ohlcv/nominal-history?ticker=&years=5 (kho bền vững phía Gateway; xem global-quanta
// docs/MARKET_DATA_GATEWAY.md "Lịch sử giá danh nghĩa dài hạn từ SSI").
//
// Trả GIÁ KHỚP DANH NGHĨA. Không dùng "giá điều chỉnh" của SSI vì (đối chiếu bản ghi gốc 02/10/2026):
//   - ClosePriceAdjusted chỉ áp hệ số của ĐỢT GẦN NHẤT cho toàn lịch sử (VNM 2021→06/2026: Adj/Close = 0,96830 mọi ngày);
//   - RefPrice không còn được điều chỉnh vào ngày GDKHQ từ 2025 (VNM 26/06/2026: 58.300 thay vì 56.450).
// Điều chỉnh do Project A tự làm từ sự kiện quyền VCI (lib/cotuc/timing-v3/total-return.ts).

export const MARKET_GATEWAY_URL = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");

export interface SsiNominalBar { date: string; close: number; ref: number | null; volume: number | null }
export interface SsiReferenceAdjustment { date: string; factor: number }

export interface SsiHistoryResult {
  success: boolean;
  data: SsiNominalBar[] | null;
  /** Gợi ý sự kiện quyền từ giá tham chiếu (đáng tin tới ~2024) — để đối chiếu chéo với VCI. */
  referenceAdjustments: SsiReferenceAdjustment[];
  source?: string | null;
  refresh?: string | null;
  error?: string;
}

export async function fetchSsiNominalHistory(
  ticker: string,
  years = 5,
  { timeoutMs = 45_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SsiHistoryResult> {
  const url = `${MARKET_GATEWAY_URL}/api/market/ohlcv/nominal-history?ticker=${encodeURIComponent(ticker)}&years=${years}`;
  try {
    const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { success: false, data: null, referenceAdjustments: [], error: `Gateway HTTP ${res.status}: ${body?.error ?? "không rõ"}` };
    const data: SsiNominalBar[] = (Array.isArray(body?.bars) ? body.bars : [])
      .filter((b: { date?: unknown; close?: unknown }) => typeof b?.date === "string" && typeof b?.close === "number" && b.close > 0)
      .map((b: { date: string; close: number; ref?: number | null; volume?: number | null }) => ({ date: b.date, close: b.close, ref: b.ref ?? null, volume: b.volume ?? null }));
    const referenceAdjustments: SsiReferenceAdjustment[] = (Array.isArray(body?.referenceAdjustments) ? body.referenceAdjustments : [])
      .filter((e: { date?: unknown; factor?: unknown }) => typeof e?.date === "string" && typeof e?.factor === "number")
      .map((e: { date: string; factor: number }) => ({ date: e.date, factor: e.factor }));
    return {
      success: data.length > 0, data, referenceAdjustments, source: body?.provenance?.source ?? null,
      refresh: body?.provenance?.refresh ?? null, error: data.length ? undefined : "Gateway trả chuỗi rỗng",
    };
  } catch (e) {
    return { success: false, data: null, referenceAdjustments: [], error: e instanceof Error ? e.message : String(e) };
  }
}
