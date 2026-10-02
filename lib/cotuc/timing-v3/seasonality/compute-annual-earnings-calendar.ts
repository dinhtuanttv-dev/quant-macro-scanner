/**
 * backend/earnings-seasonality/compute-annual-earnings-calendar.ts
 *
 * Tổng hợp AnnualEarningsCalendarV3: với mỗi quý, từ danh sách ngày công bố KQKD lịch sử
 * (nhiều năm), suy ra "tháng điển hình" + độ lệch chuẩn (để vẽ dải bất định trên trục 12
 * tháng), và gắn lại `reactionProbability` đã tính sẵn ở compute-earnings-cycle-stats.ts
 * (KHÔNG tính lại — tránh hai nơi có hai con số khác nhau cho cùng một thứ).
 *
 * Điểm cần xử lý cẩn thận: KQKD Quý 4 của năm tài khoá Y thường được công bố vào
 * tháng 1–2 của năm Y+1 (đầu quý sau). Nếu lấy trực tiếp "tháng dương lịch" của ngày công
 * bố để tính trung vị, một năm công bố ngày 28/1 và một năm công bố ngày 5/2 trông như
 * "cách nhau cả năm" theo modulo 12 nếu không cẩn thận. Giải pháp: quy mọi ngày công bố về
 * SỐ NGÀY kể từ ngày kết thúc kỳ báo cáo theo lịch (Q1→31/3, Q2→30/6, Q3→30/9, Q4→31/12),
 * suy luận năm tài khoá từ chính ngày công bố (Q4 công bố vào tháng 1-3 ⇒ năm tài khoá là
 * năm trước). Đại lượng "số ngày sau kỳ báo cáo" không có vòng lặp lịch nên median/độ lệch
 * chuẩn tính bình thường, không sai số biên.
 */
import { sampleVariance } from '../compute-cycle-stats';
import { announceCredibleInterval, announcePredictive } from './announce-date-model';
import type { AnnouncePrior } from './announce-date-model';
import type { AnnualEarningsCalendarV3, EarningsCycleStatsV3, ISODate, Quarter, QuarterSeasonality } from '../timing-types';

/** Tháng/ngày kết thúc kỳ báo cáo theo lịch cho từng quý (không phải hạn nộp báo cáo). */
const FISCAL_QUARTER_END: Record<Quarter, { month: number; day: number }> = {
  1: { month: 3, day: 31 },
  2: { month: 6, day: 30 },
  3: { month: 9, day: 30 },
  4: { month: 12, day: 31 },
};

function parseIsoUtc(iso: ISODate): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Số ngày từ ngày kết thúc kỳ báo cáo (lịch) của `quarter` đến ngày công bố `announceIso`.
 * Suy luận năm tài khoá: Q4 công bố vào tháng 1-3 ⇒ thuộc năm tài khoá TRƯỚC (Q4 năm Y-1
 * kết thúc 31/12/Y-1, công bố đầu năm Y). Các quý khác giả định công bố cùng năm dương lịch
 * với kỳ báo cáo (không xử lý trường hợp cực trị công bố trễ hơn 9 tháng).
 */
export function daysAfterFiscalQuarterEnd(announceIso: ISODate, quarter: Quarter): number | null {
  const parsed = parseIsoUtc(announceIso);
  if (!parsed) return null;
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const fiscalYear = quarter === 4 && parsed.m <= 3 ? parsed.y - 1 : parsed.y;
  const endTs = Date.UTC(fiscalYear, month - 1, day);
  const announceTs = Date.UTC(parsed.y, parsed.m - 1, parsed.d);
  return (announceTs - endTs) / 86_400_000;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Chuyển "số ngày sau kỳ báo cáo" (median) trở lại thành tháng dương lịch ĐỂ HIỂN THỊ trên
 * trục 12 tháng — dùng một năm tham chiếu trung tính (không nhuận) vì chỉ cần lấy phần
 * tháng, không cần năm thật.
 */
function typicalMonthFromOffset(quarter: Quarter, medianOffsetDays: number): number {
  const { month, day } = FISCAL_QUARTER_END[quarter];
  const REFERENCE_YEAR = 2001; // năm không nhuận, trung tính — chỉ dùng để lấy lại tháng
  const endTs = Date.UTC(REFERENCE_YEAR, month - 1, day);
  const resultTs = endTs + medianOffsetDays * 86_400_000;
  return new Date(resultTs).getUTCMonth() + 1;
}

export interface AnnualCalendarInput {
  ticker: string;
  version: string;
  asOf: string;
  /** Ngày công bố lịch sử THỰC (không phải hạn pháp lý), theo từng quý, càng nhiều năm càng tốt. */
  historicalAnnounceDatesByQuarter: Record<Quarter, ISODate[]>;
  /** Kết quả đã tính từ computeFullYearEarningsCycleStats — TÁI DÙNG reactionProbability, không tính lại. */
  earningsCycleStatsByQuarter: Record<Quarter, EarningsCycleStatsV3>;
  /** Số ngày công bố tối thiểu để coi tháng điển hình là CONFIRMED thay vì ESTIMATED. Mặc định 3. */
  minEventsForConfirmed?: number;
  /** Prior liên mã cho ngày công bố từng quý (estimateAnnouncePriorFromUniverse). Bỏ trống ⇒ prior yếu mặc định. */
  announcePriorByQuarter?: Partial<Record<Quarter, AnnouncePrior>>;
}

export function computeAnnualEarningsCalendar(input: AnnualCalendarInput): AnnualEarningsCalendarV3 {
  const minEvents = input.minEventsForConfirmed ?? 3;
  const quarters: QuarterSeasonality[] = ([1, 2, 3, 4] as Quarter[]).map((quarter) => {
    const dates = input.historicalAnnounceDatesByQuarter[quarter] ?? [];
    const offsets = dates.map((d) => daysAfterFiscalQuarterEnd(d, quarter)).filter((v): v is number => v !== null);
    const stats = input.earningsCycleStatsByQuarter[quarter];
    const reactionProbability = stats?.reactionProbability ?? null;

    const predictive = announcePredictive(offsets, input.announcePriorByQuarter?.[quarter]);
    const announceModel = {
      mu: predictive.mu,
      scale: predictive.scale,
      dof: predictive.dof,
      n: predictive.n,
      ci90: announceCredibleInterval(predictive, 0.9),
    };

    if (offsets.length === 0) {
      // Không có lịch sử ngày công bố: vẫn hiển thị vị trí "danh nghĩa" (ngay sau kỳ báo cáo
      // kết thúc) nhưng đánh dấu ESTIMATED và độ lệch chuẩn 0 (không bịa độ bất động giả).
      return {
        quarter,
        typicalAnnounceMonth: typicalMonthFromOffset(quarter, 30), // ước lượng thô: ~1 tháng sau kỳ báo cáo
        announceMonthStd: 0,
        reactionProbability,
        nEvents: 0,
        dataStatus: 'ESTIMATED',
        announceModel,
      };
    }

    const medianOffsetDays = median(offsets);
    const stdDays = offsets.length >= 2 ? Math.sqrt(sampleVariance(offsets)) : 0;
    return {
      quarter,
      typicalAnnounceMonth: typicalMonthFromOffset(quarter, medianOffsetDays),
      announceMonthStd: stdDays / 30.44,
      reactionProbability,
      nEvents: offsets.length,
      dataStatus: offsets.length >= minEvents ? 'CONFIRMED' : 'ESTIMATED',
      announceModel,
    };
  });

  return { ticker: input.ticker, version: input.version, asOf: input.asOf, quarters };
}
