// Elite 10 - Muc C (Tech Spec v2): Triple-Barrier Method (Lopez de
// Prado, "Advances in Financial Machine Learning") + Wilson Score
// Interval cho ty le thang/thua. MODULE HOAN TOAN MOI, KHONG SUA
// pattern-backtest.ts/time-engine.ts dang hoat dong dung - cung cap
// THEM 1 cach tinh label chinh xac hon (3 rao chan) SONG SONG voi
// cach cu (chi nhin gia sau N ngay co tang khong).
//
// DINH NGHIA (dung nguyen cong thuc tu Tech Spec v2, khong tu bia):
//   TP barrier = entry + ATR(14) * atrMultiplier
//   SL barrier = entry - ATR(14) * atrMultiplier
//   Quet gia MOI NGAY trong timeLimitDays phien tiep theo:
//     - Cham TP truoc -> label=1 (thang), barrierHit="take_profit"
//     - Cham SL truoc -> label=0 (thua), barrierHit="stop_loss"
//     - Khong cham gi -> label theo dau return tai ngay cuoi (time_limit)
//
// Wilson Score Interval (khong can thu vien ngoai, cong thuc chuan):
//   phat = k/n; z=1.645 (90% hai duoi)
//   center = (phat + z^2/2n) / (1+z^2/n)
//   margin = z*sqrt(phat(1-phat)/n + z^2/4n^2) / (1+z^2/n)

export interface TripleBarrierBar { date: string; open: number; high: number; low: number; close: number; }

export interface TripleBarrierResult {
  barrierHit: "take_profit" | "stop_loss" | "time_limit";
  label: 0 | 1;
  actualReturnPct: number;
  daysToHit: number;
}

/** Ap dung Triple-Barrier cho 1 tin hieu tai signalIndex. Can atrSeries
 * DA TINH SAN (tai dung calculateAtrSeries co san, khong tinh lai o day
 * de tranh phu thuoc vong). Tra ve null neu khong du du lieu gia sau
 * signalIndex (chua toi han hoac het lich su). */
export function applyTripleBarrier(
  bars: TripleBarrierBar[], signalIndex: number, atrSeries: number[],
  atrMultiplier = 1.5, timeLimitDays = 20
): TripleBarrierResult | null {
  if (signalIndex < 0 || signalIndex >= bars.length) return null;
  const entryPrice = bars[signalIndex].close;
  const atr = atrSeries[signalIndex];
  if (!atr || atr <= 0) return null;

  const tpBarrier = entryPrice + atr * atrMultiplier;
  const slBarrier = entryPrice - atr * atrMultiplier;

  const pathEnd = Math.min(bars.length, signalIndex + 1 + timeLimitDays);
  if (pathEnd - (signalIndex + 1) < timeLimitDays && pathEnd >= bars.length) {
    // Chua du du lieu de quet het timeLimitDays phien (con qua gan hien
    // tai) - khong the ket luan, tra ve null thay vi bia ket qua som.
    if (pathEnd < signalIndex + 1 + timeLimitDays) return null;
  }

  for (let i = signalIndex + 1; i < pathEnd; i++) {
    const bar = bars[i];
    // Dung High/Low trong ngay (khong chi Close) de kiem tra cham rao
    // chan - phan anh dung gia THUC TE da chay qua trong phien, giong
    // tinh than "intrabar" cua Triple-Barrier goc.
    if (bar.high >= tpBarrier) {
      return { barrierHit: "take_profit", label: 1, actualReturnPct: ((tpBarrier - entryPrice) / entryPrice) * 100, daysToHit: i - signalIndex };
    }
    if (bar.low <= slBarrier) {
      return { barrierHit: "stop_loss", label: 0, actualReturnPct: ((slBarrier - entryPrice) / entryPrice) * 100, daysToHit: i - signalIndex };
    }
  }

  const finalBar = bars[pathEnd - 1];
  const ret = ((finalBar.close - entryPrice) / entryPrice) * 100;
  return { barrierHit: "time_limit", label: ret > 0 ? 1 : 0, actualReturnPct: ret, daysToHit: pathEnd - 1 - signalIndex };
}

/** Wilson Score Interval 90% cho ty le nhi phan - phu hop hon bootstrap
 * thong thuong khi mau nho (n<30), khong gia dinh phan phoi chuan. */
export function wilsonScoreInterval90(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.645;
  const phat = successes / n;
  const denominator = 1 + (z * z) / n;
  const center = (phat + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denominator;
  return [Math.max(0, Math.round((center - margin) * 1000) / 10), Math.min(100, Math.round((center + margin) * 1000) / 10)];
}

export interface TripleBarrierStats {
  sampleSize: number; winRatePct: number; wilsonCi90: [number, number];
  breakdown: { takeProfitPct: number; stopLossPct: number; timeLimitPct: number };
  avgReturnPct: number; avgDaysToHit: number; isLowSample: boolean;
}

/** Ap dung Triple-Barrier cho TOAN BO occurrences cua 1 pattern, tong
 * hop thanh thong ke day du (thay the get_backtest_winrate don gian cu
 * bang phuong phap chinh xac hon, dung nguyen tinh than Muc C Tech Spec
 * v2). Tra ve null neu khong co ket qua hop le nao (qua it du lieu). */
export function backtestWithTripleBarrier(
  bars: TripleBarrierBar[], signalIndices: number[], atrSeries: number[],
  atrMultiplier = 1.5, timeLimitDays = 20
): TripleBarrierStats | null {
  const results: TripleBarrierResult[] = [];
  for (const idx of signalIndices) {
    const r = applyTripleBarrier(bars, idx, atrSeries, atrMultiplier, timeLimitDays);
    if (r) results.push(r);
  }
  if (results.length === 0) return null;

  const n = results.length;
  const wins = results.filter((r) => r.label === 1).length;
  const tpCount = results.filter((r) => r.barrierHit === "take_profit").length;
  const slCount = results.filter((r) => r.barrierHit === "stop_loss").length;
  const tlCount = results.filter((r) => r.barrierHit === "time_limit").length;

  return {
    sampleSize: n,
    winRatePct: Math.round((wins / n) * 1000) / 10,
    wilsonCi90: wilsonScoreInterval90(wins, n),
    breakdown: {
      takeProfitPct: Math.round((tpCount / n) * 1000) / 10,
      stopLossPct: Math.round((slCount / n) * 1000) / 10,
      timeLimitPct: Math.round((tlCount / n) * 1000) / 10,
    },
    avgReturnPct: Math.round((results.reduce((s, r) => s + r.actualReturnPct, 0) / n) * 100) / 100,
    avgDaysToHit: Math.round((results.reduce((s, r) => s + r.daysToHit, 0) / n) * 10) / 10,
    isLowSample: n < 30,
  };
}
