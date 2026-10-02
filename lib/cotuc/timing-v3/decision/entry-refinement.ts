/**
 * core/entry-refinement.ts — Biến một "vùng mua" (entryFrom..entryTo) thành một KẾ HOẠCH vào
 * lệnh cụ thể: chia nhỏ theo đợt (giảm rủi ro chọn đúng một ngày xấu), kiểm tra giá đã chạy
 * trước hay chưa (percentile so với lịch sử cùng offset — tránh mua đuổi), và các mức thoát an
 * toàn (vô hiệu hoá theo ATR, thoát theo thời gian khi hết cửa sổ).
 */
import type { CurvePoint } from './decision-types';

export interface EntryTranche {
  /** Offset ngày giao dịch so với GDKHQ/ngày công bố. */
  offset: number;
  /** Tỷ trọng của đợt này trong tổng khối lượng dự kiến, tổng các đợt = 1. */
  fraction: number;
}

/**
 * Chia vùng mua [entryFrom, entryTo] thành `tranches` đợt cách đều nhau, tỷ trọng bằng nhau.
 * `tranches=1` trả về đúng một đợt tại entryFrom (đầu cửa sổ, sớm nhất). Cửa sổ chỉ có 1 ngày
 * giao dịch thì mọi đợt trùng vào ngày đó.
 */
export function buildStagedEntryPlan(entryFrom: number, entryTo: number, tranches = 3): EntryTranche[] {
  if (!(tranches >= 1) || !Number.isInteger(tranches)) throw new Error('buildStagedEntryPlan: tranches phải là số nguyên ≥ 1');
  if (entryFrom > entryTo) throw new Error('buildStagedEntryPlan: entryFrom phải ≤ entryTo');
  const span = entryTo - entryFrom;
  const fraction = 1 / tranches;
  const offsets: number[] = [];
  for (let i = 0; i < tranches; i++) {
    const t = tranches === 1 ? 0 : i / (tranches - 1);
    offsets.push(Math.round(entryFrom + t * span));
  }
  return offsets.map((offset) => ({ offset, fraction }));
}

export interface RunTooFarResult {
  /** Phân vị (0..1) của giá trị hiện tại so với phân phối lịch sử cùng offset. null nếu không đủ dữ liệu. */
  percentile: number | null;
  /** true khi percentile ≥ ngưỡng — nghĩa là giá đã tăng nhiều hơn phần lớn các đợt lịch sử tại cùng thời điểm. */
  hasRunTooFar: boolean;
}

/**
 * So `currentValue` (CAR hiện tại của đợt đang diễn ra, tại `offset`) với phân phối CAR lịch
 * sử CÙNG offset (lấy từ CurvePoint đã có p5/p25/p75/p95, xem cycle-timeline.utils.buildCurve).
 * Vì CurvePoint chỉ giữ 4 phân vị (không phải toàn bộ mẫu gốc), percentile được suy ra bằng nội
 * suy tuyến tính giữa 4 mốc đó — đủ chính xác cho mục đích "đã chạy trước hay chưa", không cần
 * độ chính xác thống kê đầy đủ (đó là việc của compute-cycle-stats, không phải cảnh báo UI này).
 */
export function checkRunTooFar(point: CurvePoint | undefined, currentValue: number, thresholdPercentile = 0.7): RunTooFarResult {
  if (!point || point.p5 === null || point.p25 === null || point.p75 === null || point.p95 === null) {
    return { percentile: null, hasRunTooFar: false }; // không đủ dữ liệu ⇒ không cảnh báo giả
  }
  const anchors: [number, number][] = [
    [point.p5, 0.05],
    [point.p25, 0.25],
    [point.p75, 0.75],
    [point.p95, 0.95],
  ];
  let percentile: number;
  if (currentValue <= anchors[0][0]) percentile = anchors[0][1];
  else if (currentValue >= anchors[3][0]) percentile = anchors[3][1];
  else {
    let lo = anchors[0];
    let hi = anchors[3];
    for (let i = 1; i < anchors.length; i++) {
      if (currentValue <= anchors[i][0]) {
        hi = anchors[i];
        lo = anchors[i - 1];
        break;
      }
    }
    const t = hi[0] === lo[0] ? 0 : (currentValue - lo[0]) / (hi[0] - lo[0]);
    percentile = lo[1] + t * (hi[1] - lo[1]);
  }
  return { percentile, hasRunTooFar: percentile >= thresholdPercentile };
}

/** Giá vô hiệu hoá kiểu ATR: dừng theo dõi khuyến nghị nếu giá thủng mức này. */
export function computeInvalidationLevel(entryPrice: number, atr: number, atrMultiple = 2): number {
  if (entryPrice <= 0) throw new Error('computeInvalidationLevel: entryPrice phải dương');
  if (atr < 0) throw new Error('computeInvalidationLevel: atr không được âm');
  return entryPrice - atr * atrMultiple;
}

/** true nếu giá hiện tại đã thủng mức vô hiệu hoá. */
export function isInvalidated(currentPrice: number, invalidationLevel: number): boolean {
  return currentPrice <= invalidationLevel;
}

/** true nếu đã qua cửa sổ mua VÀ qua luôn điểm thoát dự kiến — không còn lý do giữ khuyến nghị. */
export function isTimeStopped(currentOffset: number, exitOffset: number): boolean {
  return currentOffset > exitOffset;
}

export interface EntryPlanSummary {
  tranches: EntryTranche[];
  runTooFar: RunTooFarResult;
  invalidationLevel: number | null;
  /** true nếu giá hiện tại đã thủng mức vô hiệu hoá — tín hiệu DỪNG CỨNG, khác với "chạy quá xa" (chỉ là tạm hoãn giải ngân). */
  invalidated: boolean;
  timeStopped: boolean;
  /** true khi nên tạm dừng giải ngân đợt tiếp theo — giá chạy quá xa HOẶC đã vô hiệu hoá HOẶC hết giờ. */
  pauseFurtherEntries: boolean;
}

export interface BuildEntryPlanInput {
  entryFrom: number;
  entryTo: number;
  exitOffset: number;
  tranches?: number;
  currentOffset: number;
  currentCarValue?: number;
  curvePointAtCurrentOffset?: CurvePoint;
  runTooFarThreshold?: number;
  entryPrice?: number;
  atr?: number;
  atrMultiple?: number;
  currentPrice?: number;
}

/** Gộp toàn bộ tinh chỉnh điểm vào thành một bản tóm tắt — dùng trực tiếp cho DecisionState. */
export function buildEntryPlanSummary(input: BuildEntryPlanInput): EntryPlanSummary {
  const tranches = buildStagedEntryPlan(input.entryFrom, input.entryTo, input.tranches ?? 3);
  const runTooFar =
    input.currentCarValue !== undefined
      ? checkRunTooFar(input.curvePointAtCurrentOffset, input.currentCarValue, input.runTooFarThreshold ?? 0.7)
      : { percentile: null, hasRunTooFar: false };
  const invalidationLevel = input.entryPrice !== undefined && input.atr !== undefined ? computeInvalidationLevel(input.entryPrice, input.atr, input.atrMultiple ?? 2) : null;
  const invalidated = invalidationLevel !== null && input.currentPrice !== undefined ? isInvalidated(input.currentPrice, invalidationLevel) : false;
  const timeStopped = isTimeStopped(input.currentOffset, input.exitOffset);

  return {
    tranches,
    runTooFar,
    invalidationLevel,
    invalidated,
    timeStopped,
    pauseFurtherEntries: runTooFar.hasRunTooFar || invalidated || timeStopped,
  };
}
