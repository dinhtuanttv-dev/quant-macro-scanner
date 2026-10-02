// Chuỗi TỔNG LỢI SUẤT SAU THUẾ cho backtest chu kỳ cổ tức (hàm thuần).
//
// Đầu vào: giá khớp DANH NGHĨA của SSI (qua Gateway /ohlcv/nominal-history) + sự kiện quyền VCI.
// Lý do không dùng "giá điều chỉnh" của SSI: xem ssi-gateway-adapter.ts (ClosePriceAdjusted chỉ áp hệ số đợt gần
// nhất cho toàn lịch sử; RefPrice không còn được điều chỉnh từ 2025).
//
// Hệ số tại ngày GDKHQ t (P = giá đóng cửa phiên liền trước, danh nghĩa):
//   cổ tức tiền mặt D:          f = 1 − D·(1 − thuế) / P     (thuế TNCN 5%, như lib/cotuc/price-adjustment.ts)
//   cổ tức CP / thưởng tỷ lệ r: f = 1 / (1 + r)              (ESOP không làm Sở điều chỉnh tham chiếu -> bỏ qua)
// adjClose_t = Close_t × Π_{s>t} f_s  (phiên cuối = giá danh nghĩa). Nắm qua GDKHQ thì đã gồm cổ tức nhận SAU THUẾ,
// nên EventSample.netDividendYield giữ = 0 (compute-cycle-io.ts).

import { CASH_DIVIDEND_TAX_RATE } from "@/lib/cotuc/price-adjustment";

export interface PriceBar { date: string; adjClose: number }
export interface NominalBar { date: string; close: number }
export interface CashDividend { exDate: string; valuePerShare: number }
export interface ShareEvent { exDate: string; ratio: number }

export interface AppliedAdjustment { exDate: string; kind: "CASH" | "SHARES"; factor: number; detail: string }
export interface TotalReturnResult {
  bars: PriceBar[];
  applied: AppliedAdjustment[];
  skipped: { exDate: string; reason: string }[];
}

export function buildTotalReturnSeries(
  nominal: NominalBar[],
  cash: CashDividend[],
  shares: ShareEvent[] = [],
  taxRate = CASH_DIVIDEND_TAX_RATE,
): TotalReturnResult {
  const bars = [...nominal].filter((p) => p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const applied: AppliedAdjustment[] = [];
  const skipped: TotalReturnResult["skipped"] = [];
  if (!bars.length) return { bars: [], applied, skipped };
  const first = bars[0].date, last = bars[bars.length - 1].date;

  const prevClose = (exDate: string): number | null => {
    let p: number | null = null;
    for (const b of bars) { if (b.date < exDate) p = b.close; else break; }
    return p;
  };
  const factorAt = new Map<string, number>();
  const push = (exDate: string, f: number) => factorAt.set(exDate, (factorAt.get(exDate) ?? 1) * f);

  for (const c of cash) {
    if (!(c.valuePerShare > 0)) continue;
    if (c.exDate <= first || c.exDate > last) { skipped.push({ exDate: c.exDate, reason: "ngoài phạm vi giá" }); continue; }
    const p = prevClose(c.exDate);
    if (!p) { skipped.push({ exDate: c.exDate, reason: "không có giá phiên trước GDKHQ" }); continue; }
    const y = (c.valuePerShare * (1 - taxRate)) / p;
    if (!(y > 0) || y >= 0.5) { skipped.push({ exDate: c.exDate, reason: `tỷ suất bất thường ${(y * 100).toFixed(1)}%` }); continue; }
    push(c.exDate, 1 - y);
    applied.push({ exDate: c.exDate, kind: "CASH", factor: 1 - y, detail: `${c.valuePerShare}đ/CP, sau thuế ${(y * 100).toFixed(2)}% giá` });
  }
  for (const s of shares) {
    if (!(s.ratio > 0) || s.ratio >= 10) { skipped.push({ exDate: s.exDate, reason: `tỷ lệ không hợp lệ ${s.ratio}` }); continue; }
    if (s.exDate <= first || s.exDate > last) { skipped.push({ exDate: s.exDate, reason: "ngoài phạm vi giá" }); continue; }
    push(s.exDate, 1 / (1 + s.ratio));
    applied.push({ exDate: s.exDate, kind: "SHARES", factor: 1 / (1 + s.ratio), detail: `tỷ lệ ${(s.ratio * 100).toFixed(1)}%` });
  }

  const out: PriceBar[] = new Array(bars.length);
  let k = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    out[i] = { date: bars[i].date, adjClose: bars[i].close * k };
    k *= factorAt.get(bars[i].date) ?? 1;
  }
  return { bars: out, applied: applied.sort((a, b) => a.exDate.localeCompare(b.exDate)), skipped };
}

/**
 * Đối chiếu chéo sự kiện VCI với gợi ý từ giá tham chiếu của Sở (SSI RefPrice, đáng tin tới ~2024):
 * trả về các đợt lệch đáng kể (hệ số VCI trước thuế vs hệ số tham chiếu) để ghi chú minh bạch.
 */
export function crossCheckWithReference(
  applied: AppliedAdjustment[],
  refAdjustments: { date: string; factor: number }[],
  taxRate = CASH_DIVIDEND_TAX_RATE,
  until = "2024-12-31",
): { matched: number; mismatched: { exDate: string; vci: number; ref: number | null }[] } {
  const refBy = new Map(refAdjustments.map((r) => [r.date, r.factor]));
  let matched = 0;
  const mismatched: { exDate: string; vci: number; ref: number | null }[] = [];
  const byDate = new Map<string, number>();
  for (const a of applied) {
    if (a.exDate > until) continue;
    // Giá tham chiếu trừ cổ tức TRƯỚC thuế -> quy hệ số VCI về trước thuế để so.
    const pre = a.kind === "CASH" ? 1 - (1 - a.factor) / (1 - taxRate) : a.factor;
    byDate.set(a.exDate, (byDate.get(a.exDate) ?? 1) * pre);
  }
  for (const [exDate, vci] of byDate) {
    const ref = refBy.get(exDate) ?? null;
    if (ref !== null && Math.abs(ref - vci) <= 0.004) matched++;
    else mismatched.push({ exDate, vci: Math.round(vci * 1e4) / 1e4, ref });
  }
  return { matched, mismatched };
}
