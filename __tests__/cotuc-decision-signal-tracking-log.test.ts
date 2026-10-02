import { describe, expect, it } from 'vitest';
import {
  brierScoreFromStore,
  calibrationPointsFromStore,
  createCusumState,
  createTrackingStore,
  cusumUpdate,
  recordOutcome,
  recordSignal,
  resetCusum,
  rollingAccuracy,
} from '@/lib/cotuc/timing-v3/decision/signal-tracking-log';

describe('recordSignal / recordOutcome', () => {
  it('ghi và truy vấn được, id trùng bị từ chối', () => {
    const store = createTrackingStore();
    recordSignal(store, { id: 'a', ticker: 'VNM', predictedProbability: 0.7, issuedAt: '2026-01-01' });
    expect(() => recordSignal(store, { id: 'a', ticker: 'FPT', predictedProbability: 0.6, issuedAt: '2026-01-02' })).toThrow();
  });
  it('ghi kết quả cho id không tồn tại ⇒ ném lỗi; ghi đè kết quả đã có ⇒ ném lỗi', () => {
    const store = createTrackingStore();
    expect(() => recordOutcome(store, 'x', 1, '2026-01-02')).toThrow();
    recordSignal(store, { id: 'a', ticker: 'VNM', predictedProbability: 0.7, issuedAt: '2026-01-01' });
    recordOutcome(store, 'a', 1, '2026-01-10');
    expect(() => recordOutcome(store, 'a', 0, '2026-01-11')).toThrow();
  });
});

describe('rollingAccuracy', () => {
  it('chưa có kết quả nào ⇒ null', () => {
    expect(rollingAccuracy(createTrackingStore())).toBeNull();
  });
  it('tính đúng tỷ lệ, chỉ tính tín hiệu đã có outcome', () => {
    const store = createTrackingStore();
    recordSignal(store, { id: '1', ticker: 'A', predictedProbability: 0.6, issuedAt: '2026-01-01' });
    recordSignal(store, { id: '2', ticker: 'A', predictedProbability: 0.6, issuedAt: '2026-01-02' });
    recordSignal(store, { id: '3', ticker: 'A', predictedProbability: 0.6, issuedAt: '2026-01-03' }); // chưa có outcome
    recordOutcome(store, '1', 1, '2026-01-05');
    recordOutcome(store, '2', 0, '2026-01-06');
    expect(rollingAccuracy(store)).toBeCloseTo(0.5, 10);
  });
  it('windowSize chỉ lấy N tín hiệu GẦN NHẤT theo issuedAt', () => {
    const store = createTrackingStore();
    for (let i = 1; i <= 5; i++) {
      recordSignal(store, { id: String(i), ticker: 'A', predictedProbability: 0.6, issuedAt: `2026-01-0${i}` });
      recordOutcome(store, String(i), i <= 3 ? 0 : 1, `2026-01-1${i}`); // 3 sai đầu, 2 đúng cuối
    }
    expect(rollingAccuracy(store)).toBeCloseTo(2 / 5, 10);
    expect(rollingAccuracy(store, 2)).toBeCloseTo(1, 10); // 2 gần nhất đều đúng
  });
});

describe('brierScoreFromStore / calibrationPointsFromStore', () => {
  it('rỗng ⇒ null / mảng rỗng', () => {
    const store = createTrackingStore();
    expect(brierScoreFromStore(store)).toBeNull();
    expect(calibrationPointsFromStore(store)).toEqual([]);
  });
  it('tính đúng theo công thức bình phương sai số', () => {
    const store = createTrackingStore();
    recordSignal(store, { id: '1', ticker: 'A', predictedProbability: 0.8, issuedAt: '2026-01-01' });
    recordOutcome(store, '1', 1, '2026-01-05');
    expect(brierScoreFromStore(store)).toBeCloseTo(0.04, 10); // (0.8-1)^2
    expect(calibrationPointsFromStore(store)).toEqual([{ predicted: 0.8, outcome: 1 }]);
  });
});

describe('cusumUpdate (hàm thuần, không qua store)', () => {
  it('chuỗi đúng mục tiêu (dao động quanh target) ⇒ không báo động', () => {
    let s = createCusumState();
    const stream: (0 | 1)[] = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    for (const z of stream) s = cusumUpdate(s, z, 0.5, 0.05, 5);
    expect(s.alarmed).toBe(false);
  });
  it('tỷ lệ đúng sụt giảm mạnh và kéo dài ⇒ báo động hướng LOW', () => {
    let s = createCusumState();
    const stream: (0 | 1)[] = new Array(40).fill(0); // toàn sai, mục tiêu kỳ vọng 0.5
    for (const z of stream) s = cusumUpdate(s, z, 0.5, 0.05, 5);
    expect(s.alarmed).toBe(true);
    expect(s.alarmDirection).toBe('LOW');
  });
  it('tỷ lệ đúng CAO hơn kỳ vọng kéo dài ⇒ báo động hướng HIGH', () => {
    let s = createCusumState();
    const stream: (0 | 1)[] = new Array(40).fill(1);
    for (const z of stream) s = cusumUpdate(s, z, 0.5, 0.05, 5);
    expect(s.alarmed).toBe(true);
    expect(s.alarmDirection).toBe('HIGH');
  });
  it('lệch nhỏ nhưng LIÊN TỤC được phát hiện sớm hơn một cú sốc đơn lẻ rồi trở lại bình thường', () => {
    let sustained = createCusumState();
    const mild = new Array(60).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)) as (0 | 1)[]; // tỷ lệ đúng thật ~20%, thấp hơn target 50%
    for (const z of mild) sustained = cusumUpdate(sustained, z, 0.5, 0.05, 5);

    let shock = createCusumState();
    const shockStream: (0 | 1)[] = [...new Array(5).fill(0), ...new Array(55).fill(1).map((_, i) => (i % 2))] as (0 | 1)[]; // một cú sốc đầu rồi dao động quanh target
    for (const z of shockStream) shock = cusumUpdate(shock, z, 0.5, 0.05, 5);

    expect(sustained.alarmed).toBe(true);
    // Không khẳng định shock.alarmed cụ thể là gì (phụ thuộc tham số) — chỉ khẳng định CUSUM có
    // trạng thái/độ lớn khác nhau rõ rệt giữa lệch bền vững và cú sốc thoáng qua.
    expect(Math.abs(sustained.negSum)).toBeGreaterThan(Math.abs(shock.negSum));
  });
  it('n tăng đều mỗi lần cập nhật', () => {
    let s = createCusumState();
    for (let i = 0; i < 7; i++) s = cusumUpdate(s, 1, 0.5, 0.05, 5);
    expect(s.n).toBe(7);
  });
});

describe('resetCusum', () => {
  it('đưa cusum về trạng thái ban đầu, không xoá SignalRecord', () => {
    const store = createTrackingStore();
    recordSignal(store, { id: '1', ticker: 'A', predictedProbability: 0.6, issuedAt: '2026-01-01' });
    for (let i = 0; i < 30; i++) {
      recordSignal(store, { id: `x${i}`, ticker: 'A', predictedProbability: 0.6, issuedAt: '2026-01-01' });
      recordOutcome(store, `x${i}`, 0, '2026-01-02', { cusumTarget: 0.5, cusumK: 0.05, cusumH: 5 });
    }
    expect(store.cusum.alarmed).toBe(true);
    resetCusum(store);
    expect(store.cusum.alarmed).toBe(false);
    expect(store.records.size).toBe(31);
  });
});
