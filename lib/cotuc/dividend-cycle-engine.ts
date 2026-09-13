// Dividend Cycle Probability Engine - chuyen doi TRUC TIEP tu 2 file
// dinh kem (dividend-cycle-terminal-v2.html + dividend_data_pipeline.py)
// sang TypeScript, dung DU LIEU THAT da co san (VCI events + Yahoo gia
// da dieu chinh) THAY VI nhap lieu thu cong.
//
// 5 CUA SO CHUAN (giu nguyen y het offset/holdDays goc, dam bao ket qua
// nhat quan voi cong cu HTML da kiem chung):
export const CYCLE_WINDOWS = [
  { id: "w1", key: "w_m1", label: "W1 · Gom sớm trước Mốc 1", offset: [-75, -60] as [number, number], holdDays: 60 },
  { id: "w2", key: "w_pre_agm", label: "W2 · Trước họp ĐHĐCĐ", offset: [-30, -15] as [number, number], holdDays: 20 },
  { id: "w3", key: "w_pre_ex", label: "W3 · Trước GDKHQ (an toàn)", offset: [-25, -15] as [number, number], holdDays: 18 },
  { id: "w4", key: "w_post_ex", label: "W4 · Ngay sau GDKHQ", offset: [3, 6] as [number, number], holdDays: 4 },
  { id: "w5", key: "w_post_credit", label: "W5 · Sau khi CP/tiền về TK", offset: [20, 35] as [number, number], holdDays: 15 },
];

export interface PriceBar { date: string; adjClose: number; }

/** Tra gia GAN NHAT truoc/dung ngay muc tieu (xu ly cuoi tuan/nghi le),
 * dung adjClose (da xac nhan Yahoo tu dong dieu chinh dung anh huong
 * co tuc - khong can tu viet lai back-adjust). */
function priceOnOrBefore(prices: PriceBar[], targetDate: Date, maxLookbackDays = 5): number | null {
  const targetStr = targetDate.toISOString().slice(0, 10);
  const minDate = new Date(targetDate); minDate.setDate(minDate.getDate() - maxLookbackDays);
  const minStr = minDate.toISOString().slice(0, 10);

  const window = prices.filter((p) => p.date <= targetStr && p.date >= minStr);
  if (window.length === 0) return null;
  return window.sort((a, b) => a.date.localeCompare(b.date))[window.length - 1].adjClose;
}

export interface WindowReturns {
  w_m1: number | null; w_pre_agm: number | null; w_pre_ex: number | null;
  w_post_ex: number | null; w_post_credit: number | null;
}

/** Tinh % loi nhuan cho 5 cua so, quanh 1 ngay GDKHQ cu the. */
export function computeWindowReturns(prices: PriceBar[], exDate: string): WindowReturns {
  const ex = new Date(exDate);
  const out: Record<string, number | null> = {};
  for (const w of CYCLE_WINDOWS) {
    const fromDate = new Date(ex); fromDate.setDate(fromDate.getDate() + w.offset[0]);
    const toDate = new Date(ex); toDate.setDate(toDate.getDate() + w.offset[1]);
    const pFrom = priceOnOrBefore(prices, fromDate);
    const pTo = priceOnOrBefore(prices, toDate);
    out[w.key] = pFrom !== null && pTo !== null && pFrom !== 0 ? Math.round((pTo / pFrom - 1) * 10000) / 100 : null;
  }
  return out as unknown as WindowReturns;
}

// ============================================================
// THONG KE: mean/std/percentile/bootstrap - chuyen doi TRUC TIEP tu JS
// goc (computeWindowStats), giu nguyen cong thuc.
// ============================================================

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(arr.length - 1, 1));
}

function percentile(sortedArr: number[], p: number): number {
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function bootstrap(arr: number[], B: number): number[] {
  const n = arr.length;
  const means: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += arr[Math.floor(Math.random() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return means;
}

export interface WindowStatResult {
  id: string; key: string; label: string; offset: [number, number]; holdDays: number;
  n: number;
  mean?: number; std?: number; winRate?: number; ci5?: number; ci95?: number;
  probMeanPositive?: number; annualized?: number; score?: number;
}

/** Tinh thong ke bootstrap + xep hang cho 1 tap hop chu ky lich su (co
 * the la 1 ma rieng hoac toan bo thi truong). costPct: chi phi giao
 * dich+thue tru vao moi cua so. B: so vong lap bootstrap. */
export function computeWindowStats(rows: WindowReturns[], costPct: number, B: number): WindowStatResult[] {
  return CYCLE_WINDOWS.map((w) => {
    const raw = rows.map((r) => r[w.key as keyof WindowReturns]).filter((v): v is number => v !== null && !Number.isNaN(v));
    if (raw.length === 0) return { ...w, n: 0 };
    const netReturns = raw.map((v) => v - costPct);
    const m = mean(netReturns);
    const sd = std(netReturns);
    const winRate = netReturns.filter((v) => v > 0).length / netReturns.length;
    const bmeans = bootstrap(netReturns, B);
    const ci5 = percentile(bmeans, 5);
    const ci95 = percentile(bmeans, 95);
    const probMeanPositive = bmeans.filter((v) => v > 0).length / bmeans.length;
    const annualized = m * (365 / w.holdDays);
    const score = annualized * winRate - sd * 0.5;
    return { ...w, n: raw.length, mean: m, std: sd, winRate, ci5, ci95, probMeanPositive, annualized, score };
  });
}
