/**
 * backend/compute-cycle-stats.ts
 *
 * Backtest Service (mục 5 tài liệu v3): với mỗi mã, mỗi cửa sổ ứng viên (entry/exit
 * offset cố định trước), tính CAR trung bình, shrinkage về prior liên mã, bootstrap
 * theo khối cho khoảng tin cậy, walk-forward ngoài mẫu, hiệu chỉnh đa so sánh (FDR),
 * và áp cổng chọn để ra `BacktestWindow[]` + `selectedWindowId` (CycleStatsV3).
 *
 * Toàn bộ hàm ở đây THUẦN và TẤT ĐỊNH: nhận PRNG được inject (mặc định mulberry32
 * seed cố định) để bootstrap tái lập được — hai lần chạy cùng dữ liệu phải ra cùng
 * kết quả (mục 12.2: version = băm mã nguồn + tham số + snapshot dữ liệu).
 *
 * Đơn giản hoá có chủ đích so với mục 5 đầy đủ:
 * - Không hồi quy market-model alpha/beta riêng cho từng cửa sổ tại đây; CAR đầu vào
 *   (`EventSample.carAtEntry` / `carAtExit`) được coi là đã tính sẵn ở lớp CAR
 *   (xem `car.ts`), market-adjusted hoặc market-model tuỳ cấu hình lớp đó.
 * - FDR dùng Benjamini–Hochberg cổ điển, không dùng bootstrap kiểu SPA/Reality Check
 *   đầy đủ. Đây là xấp xỉ hợp lý cho một hệ thống nội bộ, KHÔNG phải chuẩn học thuật.
 * - Shrinkage dùng công thức empirical-Bayes đơn giản (mục 5.4), không ước lượng
 *   phương sai liên mã bằng MLE đầy đủ.
 * Những đơn giản hoá này được ghi rõ để không ai tưởng nhầm đây là chuẩn "xong hẳn".
 */

export interface EventSample {
  exDate: string;
  /** CAR tại thời điểm entryFrom/entryTo của MỘT cửa sổ cụ thể (đã tính ở car.ts). */
  carAtEntry: number;
  /** CAR tại thời điểm exitOffset của cửa sổ đó. */
  carAtExit: number;
  /** Cổ tức tiền mặt nhận ròng nếu nắm qua GDKHQ (0 nếu thoát trước GDKHQ). Tỷ lệ trên giá mua. */
  netDividendYield: number;
  /** Năm của sự kiện (dương lịch), dùng cho walk-forward theo mục 5.5.1. */
  year: number;
}

export interface WindowCandidate {
  id: string;
  label: string;
  entryFrom: number;
  entryTo: number;
  exitOffset: number;
  holdsThroughEx: boolean;
  /** Mẫu sự kiện ĐÃ TÍNH cho đúng cửa sổ này (một mã có thể truyền nhiều cửa sổ, mỗi cửa sổ tự có mẫu). */
  samples: EventSample[];
}

export interface CostConfig {
  buyCostPct: number; // phí mua, ví dụ 0.002
  sellCostPct: number; // phí bán
  sellTaxPct: number; // thuế bán, ví dụ 0.001
  dividendTaxPct: number; // thuế TNCN cổ tức tiền mặt, ví dụ 0.05
}

export const DEFAULT_COSTS: CostConfig = {
  buyCostPct: 0.002,
  sellCostPct: 0.0015,
  sellTaxPct: 0.001,
  dividendTaxPct: 0.05,
};

export interface GatingConfig {
  minEvents: number; // mục 5.6: ≥ 8
  maxFdrQValue: number; // ≤ 0,10
  minOosMeanNetIfAvailable: number; // > 0 (chỉ áp khi đủ dữ liệu OOS)
  minYearsForOos: number; // cần ít nhất bấy nhiêu năm khác nhau để tính walk-forward có ý nghĩa
  confidenceLevel: number; // 0.90 cho cận dưới 90%
}

export const DEFAULT_GATING: GatingConfig = {
  minEvents: 8,
  maxFdrQValue: 0.1,
  minOosMeanNetIfAvailable: 0,
  minYearsForOos: 3,
  confidenceLevel: 0.9,
};

export interface BootstrapConfig {
  iterations: number;
  seed: number;
}

export const DEFAULT_BOOTSTRAP: BootstrapConfig = { iterations: 2000, seed: 20260924 };

// ---------------------------------------------------------------------------
// PRNG tất định (mulberry32) — chỉ dùng cho bootstrap, không dùng cho bảo mật.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Kỳ vọng ròng cho một sự kiện, theo công thức mục 5.3
// ---------------------------------------------------------------------------

/**
 * gross = exp(CAR_exit − CAR_entry) − 1 vì CAR ở đây là log-return market-adjusted
 * cộng dồn (xem car.ts); cộng thêm cổ tức ròng nếu cửa sổ nắm qua GDKHQ.
 */
export function netReturnOfEvent(s: EventSample, costs: CostConfig): number {
  const gross = Math.exp(s.carAtExit - s.carAtEntry) - 1;
  const divNet = s.netDividendYield * (1 - costs.dividendTaxPct);
  const cost = costs.buyCostPct + costs.sellCostPct + costs.sellTaxPct;
  return gross + divNet - cost;
}

// ---------------------------------------------------------------------------
// Shrinkage (mục 5.4)
// ---------------------------------------------------------------------------

export interface ShrinkageResult {
  shrunkMean: number;
  weight: number; // trọng số của mẫu mã (0..1); (1-weight) là trọng số của prior
}

/**
 * μ_shrunk = w·x̄ + (1−w)·μ_prior, w = n/(n+κ), κ = σ²within / τ²between.
 * `withinVar` là phương sai mẫu của chính mã đó; `betweenVar` là phương sai của các
 * giá trị trung bình liên mã (ước lượng ngoài mẫu của mã đang xét — leave-one-out).
 */
export function shrinkMean(sampleMean: number, n: number, priorMean: number, withinVar: number, betweenVar: number): ShrinkageResult {
  if (n <= 0) return { shrunkMean: priorMean, weight: 0 };
  if (betweenVar <= 0) return { shrunkMean: priorMean, weight: 0 };
  const kappa = withinVar / betweenVar;
  const weight = n / (n + kappa);
  return { shrunkMean: weight * sampleMean + (1 - weight) * priorMean, weight };
}

export function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

// ---------------------------------------------------------------------------
// Bootstrap theo khối cho khoảng tin cậy (mục 5.5.3)
// ---------------------------------------------------------------------------

/**
 * Bootstrap khối đơn giản: vì các sự kiện của một mã đã được lọc để không chồng lấn
 * (mục 5.1), lấy mẫu lại theo TỪNG SỰ KIỆN (khối = 1 sự kiện) là hợp lý; không cần
 * khối nhiều ngày vì đơn vị quan sát vốn đã là một sự kiện độc lập.
 * Trả về cận dưới của khoảng tin cậy một phía mức `confidenceLevel`.
 */
export function bootstrapLowerBound(values: number[], confidenceLevel: number, cfg: BootstrapConfig): number {
  if (values.length === 0) return Number.NaN;
  if (values.length === 1) return values[0]; // không đủ để bootstrap có ý nghĩa
  const rand = mulberry32(cfg.seed);
  const n = values.length;
  const means: number[] = new Array(cfg.iterations);
  for (let b = 0; b < cfg.iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rand() * n);
      sum += values[idx];
    }
    means[b] = sum / n;
  }
  means.sort((a, b) => a - b);
  const alpha = 1 - confidenceLevel;
  const idx = Math.max(0, Math.min(means.length - 1, Math.floor(alpha * means.length)));
  return means[idx];
}

// ---------------------------------------------------------------------------
// Walk-forward (mục 5.5.1, đơn giản hoá: cắt theo năm)
// ---------------------------------------------------------------------------

export interface WalkForwardResult {
  oosHitRate: number | null;
  oosMeanNet: number | null;
  yearsUsed: number;
}

/**
 * Với mỗi năm Y xuất hiện trong mẫu (trừ năm sớm nhất), coi mọi sự kiện TRƯỚC năm Y
 * là "trong mẫu" và sự kiện CỦA năm Y là "ngoài mẫu". Không cần huấn luyện tham số gì
 * ở đây (cửa sổ entry/exit đã cố định từ trước khi chạy), nên walk-forward chỉ đơn
 * thuần là: liệu cửa sổ này có sinh lãi ròng dương trên các năm sau, tính riêng từng
 * năm rồi gộp? Điều này vẫn tránh được việc "chọn cửa sổ sau khi thấy toàn bộ dữ liệu
 * rồi tự khen nó tốt trên chính dữ liệu đó".
 */
export function walkForward(samples: EventSample[], costs: CostConfig, minYears: number): WalkForwardResult {
  const years = Array.from(new Set(samples.map((s) => s.year))).sort((a, b) => a - b);
  if (years.length < minYears) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };

  const oosNets: number[] = [];
  for (let i = 1; i < years.length; i++) {
    const y = years[i];
    const oosThisYear = samples.filter((s) => s.year === y);
    for (const s of oosThisYear) oosNets.push(netReturnOfEvent(s, costs));
  }
  if (oosNets.length === 0) return { oosHitRate: null, oosMeanNet: null, yearsUsed: years.length };

  const hit = oosNets.filter((n) => n > 0).length / oosNets.length;
  const mean = oosNets.reduce((a, b) => a + b, 0) / oosNets.length;
  return { oosHitRate: hit, oosMeanNet: mean, yearsUsed: years.length };
}

// ---------------------------------------------------------------------------
// Kiểm định một mẫu so với 0 (t-test một phía xấp xỉ, dùng để ra p-value cho FDR)
// ---------------------------------------------------------------------------

/** Xấp xỉ CDF chuẩn tắc (Abramowitz–Stegun 7.1.26), đủ chính xác cho p-value dùng trong FDR. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** p-value một phía cho H0: kỳ vọng ≤ 0, dùng xấp xỉ z (n lớn) — chấp nhận được với n ≥ 8. */
export function oneSidedPValue(mean: number, sd: number, n: number): number {
  if (n === 0 || sd === 0) return mean > 0 ? 0 : 1;
  const z = (mean / (sd / Math.sqrt(n))) as number;
  return 1 - normalCdf(z);
}

/** Benjamini–Hochberg: trả q-value cho từng p-value đầu vào (cùng thứ tự với đầu vào). */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let prevQ = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const raw = (p * m) / rank;
    prevQ = Math.min(prevQ, Math.max(raw, 0));
    q[i] = prevQ;
  }
  return q;
}

// ---------------------------------------------------------------------------
// Lắp ráp BacktestWindow cho một cửa sổ ứng viên
// ---------------------------------------------------------------------------

export interface ComputeWindowOptions {
  costs?: CostConfig;
  gating?: GatingConfig;
  bootstrap?: BootstrapConfig;
  priorMean?: number; // CAR trung bình liên mã cho cùng cửa sổ này (leave-one-ticker-out). Mặc định 0.
  betweenVar?: number; // phương sai liên mã của CAR trung bình. Mặc định suy ra thô từ withinVar/8.
  liquidityOk?: boolean; // đã lọc thanh khoản ADTV bên ngoài; mặc định true.
}

export interface ComputedWindowStat extends Record<string, unknown> {
  window: import('./timing-types').BacktestWindow;
  pValue: number; // trước hiệu chỉnh FDR, để gộp nhiều cửa sổ/mã rồi hiệu chỉnh cùng lúc (xem computeFdrAcrossWindows)
}

/**
 * Tính một `BacktestWindow` CHƯA gán `fdrQValue` cuối cùng (để mục sau hiệu chỉnh
 * đa so sánh trên toàn bộ tập cửa sổ × mã cùng lúc, đúng mục 5.5.2). `fdrQValue`
 * tạm gán bằng chính p-value; gọi `computeFdrAcrossWindows` sau đó để thay bằng q thật.
 */
export function computeWindowStat(candidate: WindowCandidate, opts: ComputeWindowOptions = {}): ComputedWindowStat {
  const costs = opts.costs ?? DEFAULT_COSTS;
  const gating = opts.gating ?? DEFAULT_GATING;
  const bootstrap = opts.bootstrap ?? DEFAULT_BOOTSTRAP;
  const priorMean = opts.priorMean ?? 0;
  const liquidityOk = opts.liquidityOk ?? true;

  const nets = candidate.samples.map((s) => netReturnOfEvent(s, costs));
  const n = nets.length;
  const meanCarRaw = candidate.samples.length
    ? candidate.samples.reduce((a, s) => a + (s.carAtExit - s.carAtEntry), 0) / candidate.samples.length
    : 0;

  const withinVar = sampleVariance(nets);
  const betweenVar = opts.betweenVar ?? Math.max(withinVar / 8, 1e-6);
  const { shrunkMean: netExpectancy } = shrinkMean(
    n ? nets.reduce((a, b) => a + b, 0) / n : 0,
    n,
    priorMean,
    withinVar,
    betweenVar,
  );
  const { shrunkMean: meanCarShrunk } = shrinkMean(
    meanCarRaw,
    n,
    priorMean,
    sampleVariance(candidate.samples.map((s) => s.carAtExit - s.carAtEntry)),
    betweenVar,
  );

  const netExpectancyLcb = n > 0 ? bootstrapLowerBound(nets, gating.confidenceLevel, bootstrap) : Number.NaN;
  const winRate = n > 0 ? nets.filter((x) => x > 0).length / n : 0;
  const sd = Math.sqrt(withinVar);
  const pValue = oneSidedPValue(n ? nets.reduce((a, b) => a + b, 0) / n : 0, sd, n);
  const wf = walkForward(candidate.samples, costs, gating.minYearsForOos);

  const nEff = n > 0 ? n * (withinVar > 0 ? Math.min(1, betweenVar / (betweenVar + withinVar / n)) : 1) : 0;

  const passesGates =
    n >= gating.minEvents &&
    Number.isFinite(netExpectancyLcb) &&
    netExpectancyLcb > 0 &&
    liquidityOk &&
    (wf.oosMeanNet === null || wf.oosMeanNet > gating.minOosMeanNetIfAvailable);
  // Lưu ý: điều kiện fdrQValue ≤ ngưỡng được áp SAU khi hiệu chỉnh FDR toàn cục
  // (computeFdrAcrossWindows), nên `selected` ở đây là "qua mọi cổng TRỪ FDR" —
  // hàm đó sẽ AND thêm điều kiện FDR và có thể đổi selected → false.

  const window: import('./timing-types').BacktestWindow = {
    id: candidate.id,
    label: candidate.label,
    entryFrom: candidate.entryFrom,
    entryTo: candidate.entryTo,
    exitOffset: candidate.exitOffset,
    holdsThroughEx: candidate.holdsThroughEx,
    nEvents: n,
    nEff,
    meanCarRaw,
    meanCarShrunk,
    netExpectancy,
    netExpectancyLcb: Number.isFinite(netExpectancyLcb) ? netExpectancyLcb : 0,
    winRate,
    oosHitRate: wf.oosHitRate,
    oosMeanNet: wf.oosMeanNet,
    fdrQValue: pValue, // tạm thời; computeFdrAcrossWindows sẽ ghi đè bằng q thật
    selected: passesGates, // tạm thời; sẽ AND thêm điều kiện FDR
  };

  return { window, pValue };
}

/**
 * Hiệu chỉnh đa so sánh trên TOÀN BỘ cửa sổ ứng viên đã tính (nhiều mã × nhiều cửa
 * sổ cùng lúc — đúng tinh thần mục 5.5.2: số cửa sổ ứng viên phải cố định trước khi
 * chạy, và kiểm định đồng thời chứ không hiệu chỉnh riêng từng mã). Trả về danh sách
 * đã cập nhật `fdrQValue` thật và `selected` cuối cùng (AND thêm điều kiện q ≤ ngưỡng).
 */
export function computeFdrAcrossWindows(
  stats: ComputedWindowStat[],
  gating: GatingConfig = DEFAULT_GATING,
): import('./timing-types').BacktestWindow[] {
  const qValues = benjaminiHochberg(stats.map((s) => s.pValue));
  return stats.map((s, i) => ({
    ...s.window,
    fdrQValue: qValues[i],
    selected: s.window.selected && qValues[i] <= gating.maxFdrQValue,
  }));
}

/**
 * Lắp CycleStatsV3 hoàn chỉnh cho một mã: tính từng cửa sổ, hiệu chỉnh FDR chung,
 * rồi chọn `selectedWindowId` là cửa sổ có `netExpectancyLcb` cao nhất trong số các
 * cửa sổ `selected = true` (không phải cửa sổ có p-value nhỏ nhất — mục tiêu là lợi
 * nhuận kỳ vọng, không phải ý nghĩa thống kê thuần tuý).
 */
export function computeCycleStats(
  ticker: string,
  candidates: WindowCandidate[],
  opts: ComputeWindowOptions & { version: string; asOf: string; benchmark?: 'VNINDEX' | 'SECTOR' } & {
    gating?: GatingConfig;
  },
): import('./timing-types').CycleStatsV3 {
  const computed = candidates.map((c) => computeWindowStat(c, opts));
  const windows = computeFdrAcrossWindows(computed, opts.gating ?? DEFAULT_GATING);

  const eligible = windows.filter((w) => w.selected);
  const best = eligible.reduce<import('./timing-types').BacktestWindow | null>(
    (acc, w) => (acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc),
    null,
  );

  return {
    ticker,
    version: opts.version,
    asOf: opts.asOf,
    eventType: 'CASH',
    windows,
    selectedWindowId: best?.id ?? null,
    adjustedPriceBasis: 'ADJ_CLOSE',
    benchmark: opts.benchmark ?? 'VNINDEX',
  };
}
