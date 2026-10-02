// Chọn nguồn giá cho Timing Engine cổ tức: SSI (qua Market Gateway) là nguồn CHÍNH; Yahoo (mã) /
// VNDirect (VN-Index) chỉ là DỰ PHÒNG khi Gateway lỗi. Mọi kết quả ghi rõ nguồn (`source`).
//
// Cổ phiếu: giá khớp DANH NGHĨA của SSI + sự kiện quyền VCI (cổ tức tiền mặt sau thuế 5%, cổ tức CP/thưởng) ->
// chuỗi tổng lợi suất (total-return.ts), đối chiếu chéo với gợi ý từ giá tham chiếu của Sở (tới ~2024).
// Không có sự kiện VCI thì KHÔNG dùng giá SSI chưa điều chỉnh (sẽ sai quanh GDKHQ) mà chuyển sang dự phòng Yahoo:
// `adjClose` của Yahoo đã trừ cổ tức tiền mặt TRƯỚC thuế (xác minh trong yahoo-finance-adapter.ts).

import { fetchSsiNominalHistory } from "@/lib/market-data/ssi-gateway-adapter";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchIndexOhlcvHistory } from "@/lib/market-data/vndirect-adapter";
import { fetchDividendEvents } from "@/lib/cotuc/vci-events-adapter";
import { fetchVndCorporateActions } from "@/lib/cotuc/vndirect-finfo-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { averageTradedValue } from "./decision/build-decision";
import { buildTotalReturnSeries, crossCheckWithReference, type CashDividend, type PriceBar, type ShareEvent } from "./total-return";

export type PriceSourceTag = "SSI_TOTAL_RETURN" | "YAHOO_FALLBACK" | "SSI" | "VNDIRECT_FALLBACK";

export interface PriceSeriesResult {
  ok: boolean;
  prices: PriceBar[];
  source: PriceSourceTag | null;
  /** Ghi chú minh bạch (nguồn lỗi, số đợt cổ tức đã cộng…). */
  notes: string[];
  error?: string;
  /** GTGD bình quân 20 phiên (giá khớp danh nghĩa SSI × khối lượng, VND). null nếu không có dữ liệu SSI. */
  avgValue20?: number | null;
  /** Mọi ngày GDKHQ cổ tức tiền mặt từ nguồn sự kiện quyền (gồm cả đợt SẮP TỚI đã thông báo). */
  cashExDates?: string[];
}

/**
 * Sự kiện quyền -> cổ tức tiền mặt + đợt tăng số cổ phiếu (cổ tức CP / thưởng; ESOP không điều chỉnh giá).
 * VNDirect finfo là nguồn chính (VCI trả 403 từ 10/2026); VCI là dự phòng.
 */
export async function loadCorporateActions(ticker: string): Promise<{ ok: boolean; cash: CashDividend[]; shares: ShareEvent[]; source?: string; error?: string }> {
  const vnd = await fetchVndCorporateActions(ticker);
  if (vnd.ok && (vnd.cash.length || vnd.shares.length)) {
    return { ok: true, source: "VNDIRECT", cash: vnd.cash.map(({ exDate, valuePerShare }) => ({ exDate, valuePerShare })), shares: vnd.shares.map(({ exDate, ratio }) => ({ exDate, ratio })) };
  }
  const ev = await fetchDividendEvents(ticker, 66, 0);
  if (!ev.available) return { ok: false, cash: [], shares: [], error: `VNDirect: ${vnd.error ?? "không có sự kiện"}; VCI: ${ev.error ?? "không trả sự kiện"}` };
  const life = buildLifecycleEvents(ticker, ev.rawEvents ?? []);
  const day = (s: string | null) => (s ? s.slice(0, 10) : null);
  const cash = life.filter((e) => e.eventType === "CASH" && e.valuePerShare && day(e.exrightDate))
    .map((e) => ({ exDate: day(e.exrightDate)!, valuePerShare: e.valuePerShare! }));
  const shares = life.filter((e) => (e.eventType === "STOCK_DIVIDEND" || e.eventType === "BONUS_ISSUE") && e.exerciseRatio && day(e.exrightDate))
    .map((e) => ({ exDate: day(e.exrightDate)!, ratio: e.exerciseRatio! }));
  return { ok: true, source: "VCI", cash, shares };
}

export async function loadStockPrices(ticker: string, years = 5): Promise<PriceSeriesResult> {
  const notes: string[] = [];
  const [ssi, ca] = await Promise.all([fetchSsiNominalHistory(ticker, years), loadCorporateActions(ticker)]);
  if (ssi.success && ssi.data && ssi.data.length >= 60 && ca.ok) {
    const tr = buildTotalReturnSeries(ssi.data, ca.cash, ca.shares);
    const cc = crossCheckWithReference(tr.applied, ssi.referenceAdjustments);
    notes.push(`Giá SSI + ${tr.applied.length} sự kiện quyền ${ca.source} (cổ tức tiền mặt sau thuế 5%)${tr.skipped.length ? `, bỏ qua ${tr.skipped.length} đợt ngoài phạm vi/bất thường` : ""}.`);
    if (cc.matched + cc.mismatched.length) {
      notes.push(`Đối chiếu giá tham chiếu của Sở (tới 2024): khớp ${cc.matched}${cc.mismatched.length ? `, lệch ${cc.mismatched.map((m) => `${m.exDate} (VCI ${m.vci} / Sở ${m.ref ?? "không thấy"})`).join("; ")}` : ""}.`);
    }
    return { ok: true, prices: tr.bars, source: "SSI_TOTAL_RETURN", notes, avgValue20: averageTradedValue(ssi.data), cashExDates: ca.cash.map((c) => c.exDate) };
  }
  notes.push(!ssi.success
    ? `SSI lỗi (${ssi.error ?? "thiếu dữ liệu"}) — dùng dự phòng Yahoo (cổ tức trừ TRƯỚC thuế).`
    : `Thiếu sự kiện quyền (${ca.error}) — không dùng giá SSI chưa điều chỉnh; dùng dự phòng Yahoo (cổ tức trừ TRƯỚC thuế).`);
  const y = await fetchOhlcvHistory(ticker, `${years}y`);
  if (y.success && y.data && y.data.length >= 60) {
    const avgValue20 = ssi.success && ssi.data ? averageTradedValue(ssi.data) : null;
    return { ok: true, prices: y.data.map((b) => ({ date: b.date, adjClose: b.adjClose })), source: "YAHOO_FALLBACK", notes, avgValue20, cashExDates: ca.ok ? ca.cash.map((c) => c.exDate) : [] };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VCI: ${ca.error ?? "-"}; Yahoo: ${y.error ?? "thiếu dữ liệu"}` };
}

export async function loadBenchmarkPrices(years = 5): Promise<PriceSeriesResult> {
  const notes: string[] = [];
  const ssi = await fetchSsiNominalHistory("VNINDEX", years, { timeoutMs: 60_000 });
  if (ssi.success && ssi.data && ssi.data.length >= 60) {
    // Chỉ số giá (không có sự kiện quyền) — dùng nguyên giá đóng cửa.
    return { ok: true, prices: ssi.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "SSI", notes };
  }
  notes.push(`SSI VN-Index lỗi (${ssi.error ?? "thiếu dữ liệu"}) — dùng dự phòng VNDirect.`);
  const v = await fetchIndexOhlcvHistory("VNINDEX", Math.round(years * 365));
  if (v.success && v.data && v.data.length >= 60) {
    return { ok: true, prices: v.data.map((b) => ({ date: b.date, adjClose: b.close })), source: "VNDIRECT_FALLBACK", notes };
  }
  return { ok: false, prices: [], source: null, notes, error: `SSI: ${ssi.error ?? "-"}; VNDirect: ${v.error ?? "thiếu dữ liệu"}` };
}
