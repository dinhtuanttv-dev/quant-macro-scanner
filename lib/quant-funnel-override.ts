// ============================================================
// OVERRIDE TANG 4 VOI DU LIEU THUC (Yahoo Finance)
// Ham THUAN: nhan tang4Result (tu data mau) + marketData (tu API
// thuc), tra ve tang4Result MOI voi diem so da duoc tinh lai bang
// du lieu thuc cho ma nao co du lieu; ma thieu du lieu GIU NGUYEN
// diem cu tu data mau (khong bao gio de bang trong/loi).
//
// Tach rieng khoi computeTang4() goc de:
// - computeTang4() van la "ban demo" chay duoc ngay khong can API
// - Ham nay la lop bo sung tuy chon, de unit test rieng, de tat/mo
//   ma khong anh huong logic 4 tang goc.
// ============================================================

import type { Tang4Stock } from "./quant-funnel";
import type { MarketDataResponse, MarketDataTicker } from "../app/api/market-data/route";

export interface Tang4WithRealData extends Tang4Stock {
  isRealData: boolean; // true neu diem nay tinh tu du lieu thuc, false neu van la data mau
  realDataNote?: string; // ly do dung data mau (vd: "Khong co du lieu tu Yahoo Finance")
}

/**
 * Tinh lai tang4Score cho 1 ma dua tren chi bao ky thuat THUC.
 * Cong thuc giu nguyen logic trong so nhu computeTang4() goc, chi
 * doi nguon input tu data mau sang du lieu thuc.
 */
function recomputeTang4ScoreFromReal(
  baseStock: Tang4Stock,
  real: MarketDataTicker
): number {
  // breakoutBonus: data thuc chua co tin hieu breakout ro rang (can
  // them logic nhan dien mau hinh gia), nen giu nguyen tu data mau
  // cho phan nay - chi thay phan co the tinh duoc THUC: MA50 va volume.
  const ma50Penalty =
    real.ma50Status === "broken" ? -40 : real.ma50Status === "warning" ? -10 : 0;

  const volBonus = real.volumeSpikeRatio !== null
    ? Math.min(real.volumeSpikeRatio, 2.5) * 6
    : 0;

  // Giu lai breakoutBonus va leaderBonus tu data mau (chua co nguon
  // thuc cho 2 chi so nay), chi doi ma50Penalty va volBonus sang gia
  // tri thuc - day la "thay the cuc bo", khong phai tinh lai tu dau.
  const oldMa50Penalty =
    baseStock.taData?.ma50Status === "broken" ? -40 :
    baseStock.taData?.ma50Status === "warning" ? -10 : 0;
  const oldVolBonus = baseStock.taData ? Math.min(baseStock.taData.volSpike, 2.5) * 6 : 0;

  const scoreWithoutTaPart = baseStock.tang4Score - oldMa50Penalty - oldVolBonus;

  return Math.round((scoreWithoutTaPart + ma50Penalty + volBonus) * 10) / 10;
}

/**
 * Ap du lieu thuc tu Yahoo Finance len ket qua Tang 4 da tinh tu data mau.
 * @param tang4Result Ket qua computeTang4() goc (tu data mau)
 * @param marketData Ket qua tu /api/market-data (co the null neu chua load xong)
 */
export function overrideTang4WithRealData(
  tang4Result: Tang4Stock[],
  marketData: MarketDataResponse | null | undefined
): Tang4WithRealData[] {
  if (!marketData) {
    // Chua co du lieu thuc (dang loading hoac loi) -> giu nguyen 100% data mau
    return tang4Result.map((s) => ({ ...s, isRealData: false, realDataNote: "Dang tai du lieu thuc..." }));
  }

  const realMap: Record<string, MarketDataTicker> = {};
  marketData.tickers.forEach((t) => {
    realMap[t.ticker] = t;
  });

  return tang4Result.map((stock) => {
    const real = realMap[stock.ticker];

    if (!real || real.error || real.ma50Status === undefined) {
      return {
        ...stock,
        isRealData: false,
        realDataNote: real?.error
          ? `Khong co du lieu thuc: ${real.error}`
          : "Chua nam trong pham vi lay du lieu thuc (gioi han limit)",
      };
    }

    const newScore = recomputeTang4ScoreFromReal(stock, real);

    return {
      ...stock,
      tang4Score: newScore,
      taData: stock.taData
        ? { ...stock.taData, ma50Status: real.ma50Status }
        : null,
      isRealData: true,
    };
  });
}