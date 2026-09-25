/**
 * date-utils.ts - Tich hop Timing Engine v3 (Giai doan 2, backend).
 *
 * Cac ham THUAN xu ly ngay/lich giao dich, port tu core/quant-cotuc.ts
 * cua goi cotuc-timing-engine.zip (chi lay phan lien quan ngay thang,
 * KHONG lay optimizeDividendTiming/resolveEarningsImpact - do la logic
 * hien thi, thuoc frontend, da merge rieng vao src/lib/quant-cotuc.ts
 * cua repo global-quanta).
 *
 * File nay DOC LAP voi lib/quant-cotuc.ts hien co cua backend (khong
 * dung DividendStock/mock data cu) - vi 2 repo (backend qms-clean va
 * frontend global-quanta) TACH BIET HOAN TOAN, khong the import cheo.
 */

export type ISODate = string;

export interface HolidayCalendar {
  isTradingDay(dayNumber: number): boolean;
}

/** Lich chi loai thu Bay/Chu Nhat - dung cho phan DEM NGAY TUONG LAI
 * (VD "con bao nhieu ngay den DHCD sap toi") - CHAP NHAN sai so 1-2
 * ngay quanh dip le/Tet, vi day CHI la con so hien thi tham khao,
 * KHONG anh huong do chinh xac thong ke cua backtest (xem
 * PriceDerivedTradingCalendar ben duoi cho phan backtest). */
export const WEEKEND_ONLY_CALENDAR: HolidayCalendar = {
  isTradingDay(dayNumber) {
    const dow = new Date(dayNumber * 86_400_000).getUTCDay();
    return dow !== 0 && dow !== 6;
  },
};

const MAX_SPAN_CALENDAR_DAYS = 400;

export function toDayNumber(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t / 86_400_000;
}

export function dayNumberToIso(dayNumber: number): ISODate {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

export function tradingDaysBetween(from: string, to: string | null | undefined, cal: HolidayCalendar): number | null {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  if (a === null || b === null) return null;
  if (Math.abs(b - a) > MAX_SPAN_CALENDAR_DAYS) return null;
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let n = 0;
  for (let d = a + step; step > 0 ? d <= b : d >= b; d += step) {
    if (cal.isTradingDay(d)) n += step;
  }
  return n;
}

/**
 * GIAI PHAP "khong can cap nhat lich nghi le thu cong" (theo yeu cau):
 * lich giao dich SUY RA TRUC TIEP tu chinh chuoi gia THAT da tai ve -
 * ngay nao CO gia trong du lieu la ngay giao dich that, ngay nao KHONG
 * co (du la T7/CN, le, Tet, hay nghi dot xuat) deu duoc coi la khong
 * giao dich - KHONG can biet truoc ly do, tu dong dung voi MOI nam co
 * du lieu, khong bao gio can sua danh sach le thu cong.
 *
 * CHI dung cho tinh CAR/backtest LICH SU (noi do chinh xac quan
 * trong nhat) - vi CAN CO gia THAT o moi ngay lien quan. KHONG dung
 * duoc cho ngay TUONG LAI (chua co gia) - phan do dung
 * WEEKEND_ONLY_CALENDAR o tren, chap nhan sai so nho.
 */
export function makeTradingCalendarFromPrices(priceDates: readonly string[]): HolidayCalendar {
  const set = new Set<number>();
  for (const d of priceDates) {
    const n = toDayNumber(d);
    if (n !== null) set.add(n);
  }
  return {
    isTradingDay(dayNumber) {
      return set.has(dayNumber);
    },
  };
}
