/**
 * vn-holidays.ts - Lich nghi le GIAO DICH chung khoan Viet Nam THAT (HOSE + HNX) cho phan DEM NGAY TUONG LAI
 * o backend (cron timing-signals-scan: "con N ngay giao dich toi GDKHQ" o 4 cot Screener).
 *
 * BAN SAO cua global-quanta src/lib/cotuc/vn-holidays.ts (2 repo tach biet, khong import cheo duoc) -
 * KHI SUA PHAI SUA CA HAI. Nguon: Thong bao HNX 5305/TB-SGDHN (03/12/2025) va HOSE 2294/TB-SGDHCM (09/12/2025).
 * CHI co nam 2026 - khong bia nam khac; lich 2027 cap nhat khi HOSE/HNX cong bo (thuong thang 12).
 * Backtest lich su KHONG dung danh sach nay (tu suy lich giao dich tu chuoi gia that - date-utils.ts).
 */
import { WEEKEND_ONLY_CALENDAR, toDayNumber, type HolidayCalendar } from "./date-utils";

export const VN_STOCK_HOLIDAYS_2026: readonly string[] = [
  "2026-01-01", "2026-01-02",
  "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
  "2026-04-27",
  "2026-04-30", "2026-05-01",
  "2026-08-31", "2026-09-01", "2026-09-02",
];

/** Nam cuoi cung co lich nghi le chinh thuc (de canh bao khi dem sang nam chua co lich). */
export const VN_HOLIDAYS_COVERED_THROUGH = "2026-12-31";

export function makeHolidayCalendar(holidays: readonly string[]): HolidayCalendar {
  const set = new Set(holidays.map((d) => toDayNumber(d)).filter((n): n is number => n !== null));
  return { isTradingDay: (dayNumber) => WEEKEND_ONLY_CALENDAR.isTradingDay(dayNumber) && !set.has(dayNumber) };
}

export const vnHolidayCalendar = makeHolidayCalendar(VN_STOCK_HOLIDAYS_2026);
