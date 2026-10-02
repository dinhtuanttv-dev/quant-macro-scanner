import { describe, expect, it } from 'vitest';
import {
  buildEntryPlanSummary,
  buildStagedEntryPlan,
  checkRunTooFar,
  computeInvalidationLevel,
  isInvalidated,
  isTimeStopped,
} from '@/lib/cotuc/timing-v3/decision/entry-refinement';
import type { CurvePoint } from '@/lib/cotuc/timing-v3/decision/decision-types';

describe('buildStagedEntryPlan', () => {
  it('chia đều, tổng fraction = 1, offset đầu/cuối đúng biên', () => {
    const plan = buildStagedEntryPlan(-15, -5, 3);
    expect(plan).toHaveLength(3);
    expect(plan[0].offset).toBe(-15);
    expect(plan[2].offset).toBe(-5);
    expect(plan.reduce((a, t) => a + t.fraction, 0)).toBeCloseTo(1, 10);
    expect(plan.every((t) => t.fraction === plan[0].fraction)).toBe(true);
  });
  it('tranches=1 ⇒ một đợt duy nhất tại entryFrom', () => {
    const plan = buildStagedEntryPlan(-15, -5, 1);
    expect(plan).toEqual([{ offset: -15, fraction: 1 }]);
  });
  it('cửa sổ chỉ 1 ngày ⇒ mọi đợt trùng nhau', () => {
    const plan = buildStagedEntryPlan(-5, -5, 4);
    expect(plan.every((t) => t.offset === -5)).toBe(true);
  });
  it('entryFrom > entryTo hoặc tranches không hợp lệ ⇒ ném lỗi', () => {
    expect(() => buildStagedEntryPlan(-5, -15, 3)).toThrow();
    expect(() => buildStagedEntryPlan(-15, -5, 0)).toThrow();
    expect(() => buildStagedEntryPlan(-15, -5, 2.5)).toThrow();
  });
});

describe('checkRunTooFar', () => {
  const point: CurvePoint = { offset: -10, n: 10, mean: 0.01, p5: -0.02, p25: 0, p75: 0.03, p95: 0.06 };

  it('giá trị đúng bằng các mốc phân vị cho kết quả khớp', () => {
    expect(checkRunTooFar(point, -0.02).percentile).toBeCloseTo(0.05, 6);
    expect(checkRunTooFar(point, 0).percentile).toBeCloseTo(0.25, 6);
    expect(checkRunTooFar(point, 0.03).percentile).toBeCloseTo(0.75, 6);
    expect(checkRunTooFar(point, 0.06).percentile).toBeCloseTo(0.95, 6);
  });
  it('nội suy giữa hai mốc', () => {
    const mid = checkRunTooFar(point, 0.015); // giữa p25(0) và p75(0.03)
    expect(mid.percentile!).toBeCloseTo(0.5, 6);
  });
  it('ngoài biên dưới/trên ⇒ kẹp về 0,05 / 0,95, không ngoại suy', () => {
    expect(checkRunTooFar(point, -1).percentile).toBeCloseTo(0.05, 6);
    expect(checkRunTooFar(point, 1).percentile).toBeCloseTo(0.95, 6);
  });
  it('vượt ngưỡng ⇒ hasRunTooFar = true, dưới ngưỡng ⇒ false', () => {
    expect(checkRunTooFar(point, 0.05, 0.7).hasRunTooFar).toBe(true); // percentile ~0.83
    expect(checkRunTooFar(point, -0.01, 0.7).hasRunTooFar).toBe(false);
  });
  it('thiếu dữ liệu (point undefined hoặc phân vị null) ⇒ không cảnh báo giả', () => {
    expect(checkRunTooFar(undefined, 0.05)).toEqual({ percentile: null, hasRunTooFar: false });
    expect(checkRunTooFar({ ...point, p95: null }, 0.05)).toEqual({ percentile: null, hasRunTooFar: false });
  });
});

describe('computeInvalidationLevel / isInvalidated', () => {
  it('mức vô hiệu hoá = entry − ATR×hệ số', () => {
    expect(computeInvalidationLevel(100, 2, 2)).toBe(96);
  });
  it('giá thủng mức ⇒ true; trên mức ⇒ false; đúng bằng mức ⇒ true (chạm là đủ)', () => {
    expect(isInvalidated(95, 96)).toBe(true);
    expect(isInvalidated(97, 96)).toBe(false);
    expect(isInvalidated(96, 96)).toBe(true);
  });
  it('entryPrice ≤ 0 hoặc atr âm ⇒ ném lỗi', () => {
    expect(() => computeInvalidationLevel(0, 2)).toThrow();
    expect(() => computeInvalidationLevel(100, -1)).toThrow();
  });
});

describe('isTimeStopped', () => {
  it('qua điểm thoát ⇒ true; đúng lúc/trước ⇒ false', () => {
    expect(isTimeStopped(0, -1)).toBe(true);
    expect(isTimeStopped(-1, -1)).toBe(false);
    expect(isTimeStopped(-2, -1)).toBe(false);
  });
});

describe('buildEntryPlanSummary', () => {
  const point: CurvePoint = { offset: -10, n: 10, mean: 0.01, p5: -0.02, p25: 0, p75: 0.03, p95: 0.06 };

  it('gộp đủ mọi tín hiệu tạm dừng: chạy quá xa', () => {
    const r = buildEntryPlanSummary({
      entryFrom: -15, entryTo: -5, exitOffset: -1, currentOffset: -10,
      currentCarValue: 0.08, curvePointAtCurrentOffset: point,
    });
    expect(r.runTooFar.hasRunTooFar).toBe(true);
    expect(r.invalidated).toBe(false);
    expect(r.pauseFurtherEntries).toBe(true);
    expect(r.timeStopped).toBe(false);
  });
  it('gộp tín hiệu vô hiệu hoá theo ATR', () => {
    const r = buildEntryPlanSummary({
      entryFrom: -15, entryTo: -5, exitOffset: -1, currentOffset: -10,
      entryPrice: 100, atr: 3, atrMultiple: 2, currentPrice: 93,
    });
    expect(r.invalidationLevel).toBe(94);
    expect(r.invalidated).toBe(true);
    expect(r.pauseFurtherEntries).toBe(true);
  });
  it('gộp tín hiệu hết thời gian', () => {
    const r = buildEntryPlanSummary({ entryFrom: -15, entryTo: -5, exitOffset: -1, currentOffset: 0 });
    expect(r.timeStopped).toBe(true);
    expect(r.pauseFurtherEntries).toBe(true);
  });
  it('mọi thứ bình thường ⇒ không tạm dừng', () => {
    const r = buildEntryPlanSummary({ entryFrom: -15, entryTo: -5, exitOffset: -1, currentOffset: -10, currentCarValue: 0.005, curvePointAtCurrentOffset: point });
    expect(r.pauseFurtherEntries).toBe(false);
    expect(r.tranches.length).toBeGreaterThan(0);
  });
  it('không cung cấp currentCarValue/entryPrice ⇒ không suy diễn, chỉ dựa timeStopped', () => {
    const r = buildEntryPlanSummary({ entryFrom: -15, entryTo: -5, exitOffset: -1, currentOffset: -10 });
    expect(r.runTooFar).toEqual({ percentile: null, hasRunTooFar: false });
    expect(r.invalidationLevel).toBeNull();
    expect(r.pauseFurtherEntries).toBe(false);
  });
});
