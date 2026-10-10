// Port từ locnganh-timing-engine (core/probability-calibration.test.ts).
import { describe, expect, it } from 'vitest';
import { applyCalibration, brierScore, calibrationBins, fitCalibrationMap, isIdentityCalibrationMap, poolAdjacentViolators } from "@/lib/locnganh/probability-calibration";

describe('brierScore', () => {
  it('hoàn hảo ⇒ 0; đoán mù luôn 0,5 ⇒ 0,25', () => {
    expect(brierScore([{ predicted: 1, outcome: 1 }, { predicted: 0, outcome: 0 }])).toBe(0);
    expect(brierScore([{ predicted: 0.5, outcome: 1 }, { predicted: 0.5, outcome: 0 }])).toBeCloseTo(0.25, 10);
  });
  it('mảng rỗng ⇒ null', () => {
    expect(brierScore([])).toBeNull();
  });
});

describe('poolAdjacentViolators', () => {
  it('dãy đã đơn điệu ⇒ giữ nguyên', () => {
    expect(poolAdjacentViolators([0.1, 0.3, 0.6], [1, 1, 1])).toEqual([0.1, 0.3, 0.6]);
  });
  it('vi phạm đơn giản: [0.6, 0.2] ⇒ gộp thành trung bình 0,4 cả hai điểm', () => {
    const r = poolAdjacentViolators([0.6, 0.2], [1, 1]);
    expect(r[0]).toBeCloseTo(0.4, 10);
    expect(r[1]).toBeCloseTo(0.4, 10);
  });
  it('vi phạm lan chuỗi: [0.1, 0.6, 0.2, 0.3] ⇒ gộp 3 điểm giữa, kết quả vẫn đơn điệu không giảm', () => {
    const r = poolAdjacentViolators([0.1, 0.6, 0.2, 0.3], [1, 1, 1, 1]);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1] - 1e-12);
    expect(r[1]).toBeCloseTo((0.6 + 0.2 + 0.3) / 3, 10);
  });
  it('trọng số khác nhau ảnh hưởng đúng vị trí trung bình gộp', () => {
    const r = poolAdjacentViolators([0.8, 0.2], [1, 3]); // điểm sau nặng gấp 3 ⇒ trung bình gộp lệch về 0,2
    const expected = (0.8 * 1 + 0.2 * 3) / 4;
    expect(r[0]).toBeCloseTo(expected, 10);
  });
  it('độ dài không khớp ⇒ ném lỗi; mảng rỗng ⇒ rỗng', () => {
    expect(() => poolAdjacentViolators([1], [1, 2])).toThrow();
    expect(poolAdjacentViolators([], [])).toEqual([]);
  });
});

describe('fitCalibrationMap / applyCalibration', () => {
  it('mô hình "tự tin thái quá" (luôn báo 0,9 nhưng chỉ đúng 50%) ⇒ hiệu chỉnh kéo về gần 0,5', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ predicted: 0.9, outcome: (i % 2) as 0 | 1 }));
    const map = fitCalibrationMap(points, { minSamples: 0 }); // ép fit thật dù mẫu nhỏ — bài test này nhắm vào hành vi PAVA, không nhắm vào ngưỡng minSamples (có bộ test riêng ở dưới)
    expect(applyCalibration(map, 0.9)).toBeCloseTo(0.5, 6);
  });
  it('mô hình đã hiệu chỉnh tốt ⇒ brierAfter ≤ brierBefore', () => {
    const points = [
      { predicted: 0.9, outcome: 0 as const }, { predicted: 0.9, outcome: 1 as const }, { predicted: 0.9, outcome: 0 as const },
      { predicted: 0.2, outcome: 0 as const }, { predicted: 0.2, outcome: 1 as const }, { predicted: 0.2, outcome: 0 as const },
    ];
    const map = fitCalibrationMap(points);
    expect(map.brierAfter!).toBeLessThanOrEqual(map.brierBefore! + 1e-9);
  });
  it('nội suy tuyến tính giữa hai neo; kẹp ở biên, không ngoại suy', () => {
    const points = [
      { predicted: 0.2, outcome: 0 as const }, { predicted: 0.2, outcome: 0 as const },
      { predicted: 0.8, outcome: 1 as const }, { predicted: 0.8, outcome: 1 as const },
    ];
    const map = fitCalibrationMap(points, { minSamples: 0 }); // ép fit thật dù mẫu nhỏ — xem ghi chú ở bài test phía trên
    expect(applyCalibration(map, 0.5)).toBeCloseTo(0.5, 6); // giữa 0 và 1, nội suy tuyến tính
    expect(applyCalibration(map, 0.05)).toBeCloseTo(0, 6); // dưới điểm neo thấp nhất ⇒ giữ biên
    expect(applyCalibration(map, 0.99)).toBeCloseTo(1, 6);
  });
  it('không có dữ liệu ⇒ trả nguyên xác suất đầu vào (không hiệu chỉnh mù)', () => {
    const map = fitCalibrationMap([]);
    expect(applyCalibration(map, 0.73)).toBe(0.73);
  });
  it('chỉ một điểm dữ liệu nhưng dưới minSamples mặc định (30) ⇒ identity, KHÔNG hiệu chỉnh', () => {
    const map = fitCalibrationMap([{ predicted: 0.6, outcome: 1 }]);
    expect(applyCalibration(map, 0.6)).toBeCloseTo(0.6, 10);
    expect(isIdentityCalibrationMap(map)).toBe(true);
  });
});

describe('fitCalibrationMap: ngưỡng minSamples (mượn từ src/decision/calibration.ts, xem HANDOFF.md mục 0.1)', () => {
  it('dưới minSamples ⇒ identity dù dữ liệu trông "tự tin thái quá" rõ ràng', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ predicted: 0.9, outcome: (i % 2) as 0 | 1 }));
    const map = fitCalibrationMap(points, { minSamples: 30 });
    expect(isIdentityCalibrationMap(map)).toBe(true);
    expect(applyCalibration(map, 0.9)).toBeCloseTo(0.9, 10); // KHÔNG bị kéo về 0,5 như khi đủ mẫu
  });
  it('đạt đúng minSamples ⇒ hiệu chỉnh thật (không còn identity)', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({ predicted: 0.9, outcome: (i % 2) as 0 | 1 }));
    const map = fitCalibrationMap(points, { minSamples: 30 });
    expect(isIdentityCalibrationMap(map)).toBe(false);
    expect(applyCalibration(map, 0.9)).toBeCloseTo(0.5, 6);
  });
  it('minSamples tuỳ chỉnh nhỏ hơn có hiệu lực', () => {
    const points = Array.from({ length: 5 }, (_, i) => ({ predicted: 0.9, outcome: (i % 2) as 0 | 1 }));
    expect(isIdentityCalibrationMap(fitCalibrationMap(points, { minSamples: 10 }))).toBe(true);
    expect(isIdentityCalibrationMap(fitCalibrationMap(points, { minSamples: 5 }))).toBe(false);
  });
  it('mảng rỗng luôn identity-rỗng bất kể minSamples', () => {
    expect(fitCalibrationMap([], { minSamples: 1 }).anchors).toEqual([]);
  });
});

describe('isIdentityCalibrationMap', () => {
  it('map rỗng ⇒ false (không có neo nào để coi là đồng nhất)', () => {
    expect(isIdentityCalibrationMap({ anchors: [], n: 0, brierBefore: null, brierAfter: null })).toBe(false);
  });
});

describe('calibrationBins', () => {
  it('rỗng ⇒ mảng rỗng', () => {
    expect(calibrationBins([])).toEqual([]);
  });
  it('mỗi bin có empiricalRate đúng bằng tần suất outcome=1 trong bin', () => {
    const points = [
      { predicted: 0.1, outcome: 0 as const }, { predicted: 0.15, outcome: 0 as const },
      { predicted: 0.8, outcome: 1 as const }, { predicted: 0.85, outcome: 1 as const },
    ];
    const bins = calibrationBins(points, 2);
    expect(bins).toHaveLength(2);
    expect(bins[0].empiricalRate).toBeCloseTo(0, 10);
    expect(bins[1].empiricalRate).toBeCloseTo(1, 10);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(4);
  });
});
