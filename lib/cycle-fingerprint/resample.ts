// lib/cycle-fingerprint/resample.ts
//
// NHOM 2 (Da khung thoi gian): gop nen OHLCV hang NGAY thanh TUAN/THANG.
// Day la buoc TIEN XU LY DAU VAO DUY NHAT - toan bo pipeline phia sau
// (findTopKCycles, computeFanChart, computeTimingForecast...) GIU NGUYEN
// KHONG DOI, chi nhan mang OhlcvBar khac (tuan/thang thay vi ngay) thay vi
// bi sua logic ben trong - giam toi da rui ro so voi cach lam Nhom 1.
import type { OhlcvBar } from "@/lib/market-data/tcbs-adapter";

/** Khoa ISO-week that (thu Hai la ngay dau tuan) tu 1 ngay yyyy-mm-dd. */
function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  // Dua ve thu Nam cua tuan chua no (ISO 8601: tuan chua ngay thu Nam nay
  // la tuan so may) - cach chuan de tinh ISO week khong sai lech nam moi.
  const target = new Date(d);
  const dayNr = (d.getUTCDay() + 6) % 7; // 0 = Thu Hai
  target.setUTCDate(d.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNr).padStart(2, "0")}`;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "yyyy-mm"
}

/**
 * Gop 1 nhom cac nen NGAY (da CUNG 1 tuan/thang, theo DUNG thu tu thoi
 * gian tang dan) thanh 1 nen duy nhat:
 * open = open cua nen DAU nhom, close = close cua nen CUOI nhom,
 * high = max, low = min, volume = tong.
 */
function aggregateGroup(group: OhlcvBar[]): OhlcvBar {
  const open = group[0].open;
  const close = group[group.length - 1].close;
  const high = Math.max(...group.map((b) => b.high));
  const low = Math.min(...group.map((b) => b.low));
  const volume = group.reduce((s, b) => s + b.volume, 0);
  // Dung ngay CUOI nhom lam "ngay dai dien" cua nen gop - khop voi quy uoc
  // "gia dong cua tai ngay ket thuc ky" khi hien thi/tinh toan.
  return { date: group[group.length - 1].date, open, high, low, close, volume };
}

function resampleByKey(bars: OhlcvBar[], keyFn: (dateStr: string) => string): OhlcvBar[] {
  if (bars.length === 0) return [];
  const groups = new Map<string, OhlcvBar[]>();
  for (const bar of bars) {
    const key = keyFn(bar.date);
    const list = groups.get(key) ?? [];
    list.push(bar);
    groups.set(key, list);
  }
  // Map giu thu tu insert - bars dau vao da sap xep tang dan theo thoi gian
  // (dung quy uoc toan he thong) nen thu tu nhom cung tang dan dung.
  const aggregated = Array.from(groups.values()).map(aggregateGroup);

  // BO NHOM CUOI CUNG neu chua "day du" (VD: dang o giua tuan/thang hien
  // tai, du lieu chua het ky) - tranh 1 nen "non" lam sai lech cua so phan
  // tich hien tai (so sanh khong cong bang voi cac ky lich su da hoan tat).
  const lastGroupKey = Array.from(groups.keys())[groups.size - 1];
  const lastGroupSize = groups.get(lastGroupKey)?.length ?? 0;
  const expectedMinSize = 4; // tuan/thang du lieu that thuong co >=4 phien giao dich
  if (lastGroupSize < expectedMinSize && aggregated.length > 1) {
    aggregated.pop();
  }

  return aggregated;
}

export function resampleToWeekly(bars: OhlcvBar[]): OhlcvBar[] {
  return resampleByKey(bars, isoWeekKey);
}

export function resampleToMonthly(bars: OhlcvBar[]): OhlcvBar[] {
  return resampleByKey(bars, monthKey);
}
