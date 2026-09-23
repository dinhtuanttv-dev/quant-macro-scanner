// Elite 10 - Giai doan 4/4: Backtest thong ke chat che cho MOI pattern
// SMC/Wyckoff da phat hien (Giai doan 1-3). MODULE HOAN TOAN MOI.
//
// NGUYEN TAC: KHONG viet lai bootstrap - TAI DUNG 100% ham
// buildWindowStats() da co san trong lib/elite10/time-engine.ts (da
// test khop 100% voi ban Python goc, dang chay dung cho Tab Co Tuc/Time
// Engine). Module nay CHI lam nhiem vu: quet TOAN BO lich su cho 1 loai
// pattern (VD "FVG bullish"), tinh % loi nhuan N phien SAU MOI LAN
// pattern do xay ra, roi dua ket qua vao buildWindowStats() - giong het
// cach Time Engine da lam cho "cua so dividend", chi khac O DAY "su
// kien" la 1 pattern SMC/Wyckoff thay vi 1 su kien GDKHQ/DHCD.
import { buildWindowStats, type EventWindowTemplateDef, type WindowStat } from "@/lib/elite10/time-engine";

export interface PatternOccurrence { date: string; direction: "bullish" | "bearish" }
export interface PriceBarForBacktest { date: string; adjClose: number }

/** Tinh % thay doi gia N phien SAU 1 ngay cu the (tim ngay GAN NHAT
 * >= targetDate trong bars, giong cach EventVolatilityTable da lam). */
function priceChangeAfterNBars(bars: PriceBarForBacktest[], eventDate: string, holdDays: number): number | null {
  const idx = bars.findIndex((b) => b.date === eventDate);
  if (idx === -1 || idx + holdDays >= bars.length) return null;
  const priceAtEvent = bars[idx].adjClose;
  const priceAfter = bars[idx + holdDays].adjClose;
  if (priceAtEvent <= 0) return null;
  return ((priceAfter - priceAtEvent) / priceAtEvent) * 100;
}

/** Backtest 1 loai pattern: voi MOI lan pattern xay ra trong lich su,
 * tinh % loi nhuan sau holdDays phien, roi dua qua buildWindowStats()
 * (co san bootstrap CI90, win rate, sample size, is_low_sample - Y HET
 * logic da dung cho Time Engine). direction=bearish se DAO NGUOC dau %
 * (vi "thang" voi pattern giam gia nghia la GIA GIAM, khong phai TANG). */
export function backtestPattern(
  bars: PriceBarForBacktest[],
  occurrences: PatternOccurrence[],
  patternLabel: string,
  holdDays = 10
): WindowStat | null {
  if (occurrences.length === 0) return null;

  const rows: Record<string, number | null>[] = occurrences.map((occ) => {
    const rawReturn = priceChangeAfterNBars(bars, occ.date, holdDays);
    if (rawReturn === null) return { after: null };
    // Bearish pattern: "thang" = gia GIAM, nen dao dau de winRate/avgReturn
    // phan anh dung huong ky vong cua pattern (giong quy uoc dividend/AGM
    // windows - "thang" luon nghia la dung huong ky vong).
    const adjustedReturn = occ.direction === "bearish" ? -rawReturn : rawReturn;
    return { after: adjustedReturn };
  });

  const template: EventWindowTemplateDef = {
    eventType: "seasonal_month", // tai dung enum co san, khong can them enum moi chi cho 1 field hien thi
    label: patternLabel,
    windows: [{ id: "after", label: patternLabel, anchor: "after_event", offsetDays: [0, 0], holdDays }],
  };

  const stats = buildWindowStats(rows, template);
  return stats[0] ?? null;
}
