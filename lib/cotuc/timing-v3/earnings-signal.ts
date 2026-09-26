/**
 * backend/earnings-signal.ts
 *
 * Tính EarningsSignal (mục 4.3, 7 của tài liệu v3) từ lịch sử công bố KQKD:
 * - Ước lượng độ trễ công bố so với hạn pháp lý (mục 7.2) để suy ra ngày công bố dự kiến.
 * - SUE theo mô hình bước ngẫu nhiên có mùa vụ (seasonal random walk with drift, mục 7.3).
 * - Phân loại OK / THIN_HISTORY / NEGATIVE_BASE / DISTORTED.
 * - Tách chỉ số theo ngân hàng / phi ngân hàng (mục 7.4) ở tầng gọi (input đã chọn đúng
 *   trường theo `isBank`; hàm ở đây chỉ nhận một chuỗi `earningsMetric` duy nhất).
 *
 * Toàn bộ hàm THUẦN: không đọc đồng hồ hệ thống (ngày "hôm nay" là tham số).
 */
import type { EarningsSignal } from './timing-types';
import { toDayNumber, dayNumberToIso } from './date-utils';

export interface QuarterlyRecord {
  quarterLabel: string; // "Q2/2026"
  /** Hạn pháp lý công bố BCTC (standalone hoặc consolidated tuỳ backend chọn). */
  legalDeadline: string;
  /** Ngày thực tế đã công bố. Bỏ trống với quý CHƯA công bố (quý đang cần dự báo). */
  announceDate?: string | null;
  /** Chỉ số lợi nhuận dùng cho SUE: LNST phi ngân hàng, hoặc thu nhập lãi thuần/NIM-proxy cho ngân hàng. Đơn vị tuỳ ý, nhất quán qua các quý. */
  earningsMetric: number | null;
  /** Tỷ trọng lợi nhuận bất thường trong LNST kỳ này (0..1). null nếu không tách được. */
  extraordinaryShare?: number | null;
}

export interface EstimateAnnounceOptions {
  /** Số quý gần nhất dùng để ước lượng độ trễ (mục 7.2). Mặc định 8. */
  lagWindowQuarters?: number;
  /** Dưới ngưỡng này thì coi là chưa đủ lịch sử để tin cậy độ trễ (method = DEADLINE_ONLY). */
  minQuartersForLag?: number;
}

const DEFAULT_LAG_WINDOW = 8;
const DEFAULT_MIN_QUARTERS_FOR_LAG = 4;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** MAD (median absolute deviation) quy đổi về thang độ lệch chuẩn (nhân 1,4826), bền hơn std thô với outlier. */
function madStd(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = median(xs);
  const dev = xs.map((x) => Math.abs(x - m));
  return 1.4826 * median(dev);
}

/**
 * Ước lượng ngày công bố dự kiến cho quý CHƯA công bố, dựa trên độ trễ (ngày lịch)
 * giữa hạn pháp lý và ngày công bố thực của các quý ĐÃ công bố gần nhất.
 */
export function estimateAnnounceDate(
  historicalRecords: QuarterlyRecord[],
  targetLegalDeadline: string,
  opts: EstimateAnnounceOptions = {},
): EarningsSignal['expectedAnnounce'] {
  const lagWindow = opts.lagWindowQuarters ?? DEFAULT_LAG_WINDOW;
  const minQuarters = opts.minQuartersForLag ?? DEFAULT_MIN_QUARTERS_FOR_LAG;

  const lags: number[] = [];
  for (const r of historicalRecords) {
    if (!r.announceDate) continue;
    const dl = toDayNumber(r.legalDeadline);
    const an = toDayNumber(r.announceDate);
    if (dl === null || an === null) continue;
    lags.push(dl - an); // dương: công bố trước hạn
  }
  const recent = lags.slice(-lagWindow);

  const deadlineDay = toDayNumber(targetLegalDeadline);
  if (deadlineDay === null) {
    // Không có hạn hợp lệ: không thể ước lượng gì, coi hạn = chính nó (điểm dừng an toàn).
    return { date: targetLegalDeadline, method: 'DEADLINE_ONLY', lagStdDays: null };
  }

  if (recent.length < minQuarters) {
    return { date: targetLegalDeadline, method: 'DEADLINE_ONLY', lagStdDays: null };
  }

  const lagMedian = median(recent);
  const lagStd = madStd(recent);
  const announceDay = deadlineDay - Math.round(lagMedian);
  return { date: dayNumberToIso(announceDay), method: 'HISTORICAL_LAG', lagStdDays: lagStd };
}

// ---------------------------------------------------------------------------
// SUE — Standardized Unexpected Earnings (mục 7.3)
// ---------------------------------------------------------------------------

export interface SueResult {
  sue: number | null;
  yoyGrowth: number | null;
  quality: EarningsSignal['quality'];
}

/**
 * `series` là chuỗi `earningsMetric` theo thứ tự thời gian TĂNG DẦN, kết thúc ở quý
 * liền trước quý đang xét (KHÔNG bao gồm quý đang dự báo — đó chính là điều làm cho
 * đây là ước lượng "trước khi biết kết quả", tránh nhầm với hồi quy trong mẫu).
 * `currentActual` là kết quả thực của quý đang xét, nếu đã có (dùng để tính SUE thực
 * tế sau khi công bố); truyền null nếu đang ở giai đoạn DỰ BÁO (chưa công bố) — khi đó
 * hàm trả `sue: null` vì SUE chỉ có ý nghĩa SAU khi biết kết quả thực.
 */
export function computeSue(series: number[], currentActual: number | null, minHistory = 8): SueResult {
  if (currentActual === null) return { sue: null, yoyGrowth: null, quality: 'THIN_HISTORY' };
  if (series.length < 5) return { sue: null, yoyGrowth: null, quality: 'THIN_HISTORY' };

  const laggedSameQuarter = series[series.length - 4]; // E_{q-4}
  if (laggedSameQuarter === undefined) return { sue: null, yoyGrowth: null, quality: 'THIN_HISTORY' };

  const yoyGrowth = laggedSameQuarter !== 0 ? currentActual / laggedSameQuarter - 1 : null;

  // Nền âm hoặc quá gần 0: tăng trưởng % vô nghĩa (mục 7.3).
  if (Math.abs(laggedSameQuarter) < 1e-9 || laggedSameQuarter < 0) {
    return { sue: null, yoyGrowth: null, quality: 'NEGATIVE_BASE' };
  }

  // drift: tăng trưởng YoY trung bình của các quý trước đó (bước ngẫu nhiên có mùa, có drift).
  const yoyDiffs: number[] = [];
  for (let i = 4; i < series.length; i++) {
    const base = series[i - 4];
    if (base > 0) yoyDiffs.push(series[i] - base);
  }
  const drift = yoyDiffs.length ? yoyDiffs.reduce((a, b) => a + b, 0) / yoyDiffs.length : 0;
  const ue = currentActual - laggedSameQuarter - drift;

  const history = series.length >= minHistory ? series.slice(-minHistory) : series;
  const ueHistory: number[] = [];
  for (let i = 4; i < history.length; i++) {
    const base = history[i - 4];
    if (base > 0) ueHistory.push(history[i] - base - drift);
  }
  const sigma = Math.sqrt(sampleVar(ueHistory));
  if (sigma === 0 || ueHistory.length < 3) return { sue: null, yoyGrowth, quality: 'THIN_HISTORY' };

  const sue = ue / sigma;
  return { sue, yoyGrowth, quality: series.length >= minHistory ? 'OK' : 'THIN_HISTORY' };
}

function sampleVar(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

// ---------------------------------------------------------------------------
// Lắp ráp EarningsSignal hoàn chỉnh
// ---------------------------------------------------------------------------

export interface BuildEarningsSignalInput {
  ticker: string;
  isBank: boolean;
  /** Lịch sử quý ĐÃ công bố, tăng dần theo thời gian, dùng để ước lượng lag và SUE. */
  history: QuarterlyRecord[];
  /** Quý đang xét (có thể đã công bố hoặc chưa — nếu đã công bố, `earningsMetric` khác null). */
  target: QuarterlyRecord;
  revenueGrowthYoY: number | null;
  profitGrowthYoY: number | null;
  profitTtmGrowthYoY: number | null;
  version: string;
  asOf: string;
}

export function buildEarningsSignal(input: BuildEarningsSignalInput): EarningsSignal {
  const expectedAnnounce = estimateAnnounceDate(input.history, input.target.legalDeadline);

  const series = input.history.map((h) => h.earningsMetric).filter((x): x is number => x !== null);
  const currentActual = input.target.announceDate ? input.target.earningsMetric : null;
  const sueResult = computeSue(series, currentActual);

  // Chất lượng bị hạ nếu lợi nhuận bất thường chiếm tỷ trọng lớn (mục 7.3).
  // Áp dụng bất kể quality trước đó (kể cả THIN_HISTORY): tỷ trọng bất thường cao khiến
  // CHÍNH con số của quý này không đáng tin để so sánh, không phụ thuộc có đủ lịch sử hay không.
  const extraordinaryShare = input.target.extraordinaryShare ?? null;
  let quality = sueResult.quality;
  if (extraordinaryShare !== null && extraordinaryShare >= 0.3) {
    quality = 'DISTORTED';
  }

  return {
    ticker: input.ticker,
    isBank: input.isBank,
    quarterLabel: input.target.quarterLabel,
    legalDeadline: input.target.legalDeadline,
    expectedAnnounce,
    sue: quality === 'OK' ? sueResult.sue : null,
    revenueGrowthYoY: input.revenueGrowthYoY,
    profitGrowthYoY: input.profitGrowthYoY,
    profitTtmGrowthYoY: input.profitTtmGrowthYoY,
    extraordinaryShare,
    quality,
    version: input.version,
    asOf: input.asOf,
  };
}
