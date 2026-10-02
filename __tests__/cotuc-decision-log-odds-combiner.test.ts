import { describe, expect, it } from 'vitest';
import { combineLogOdds } from '@/lib/cotuc/timing-v3/decision/log-odds-combiner';

describe('combineLogOdds: trường hợp cơ bản', () => {
  it('không có tín hiệu nào ⇒ trả shrinkTo (mặc định 0,5)', () => {
    const r = combineLogOdds([]);
    expect(r.probability).toBeCloseTo(0.5, 10);
    expect(r.contributions).toHaveLength(0);
    expect(r.totalWeight).toBe(0);
  });
  it('tín hiệu null bị loại hoàn toàn, không tính là 0 hay 0,5', () => {
    const withNull = combineLogOdds([{ name: 'a', probability: null, weight: 5 }, { name: 'b', probability: 0.8, weight: 2 }]);
    const withoutNull = combineLogOdds([{ name: 'b', probability: 0.8, weight: 2 }]);
    expect(withNull.probability).toBeCloseTo(withoutNull.probability, 10);
    expect(withNull.contributions).toHaveLength(1);
  });
  it('trọng số 0 hoặc âm bị loại', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.9, weight: 0 }, { name: 'b', probability: 0.5, weight: 3 }]);
    expect(r.contributions.map((c) => c.name)).toEqual(['b']);
  });
  it('một tín hiệu duy nhất bằng đúng shrinkTo ⇒ kết quả không đổi (không có gì để shrink lệch đi)', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.5, weight: 10 }]);
    expect(r.probability).toBeCloseTo(0.5, 6);
  });
});

describe('combineLogOdds: cộng dồn bằng chứng', () => {
  it('nhiều tín hiệu CÙNG CHIỀU dương ⇒ xác suất gộp cao hơn từng tín hiệu riêng lẻ (trước shrink)', () => {
    const single = combineLogOdds([{ name: 'a', probability: 0.7, weight: 3 }], { shrinkStrength: 0 });
    const triple = combineLogOdds(
      [{ name: 'a', probability: 0.7, weight: 3 }, { name: 'b', probability: 0.7, weight: 3 }, { name: 'c', probability: 0.7, weight: 3 }],
      { shrinkStrength: 0 },
    );
    expect(triple.probabilityBeforeShrink).toBeGreaterThan(single.probabilityBeforeShrink);
  });
  it('tín hiệu trái chiều triệt tiêu nhau: 0,8 và 0,2 cùng trọng số ⇒ về đúng 0,5', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.8, weight: 5 }, { name: 'b', probability: 0.2, weight: 5 }], { shrinkStrength: 0 });
    expect(r.probabilityBeforeShrink).toBeCloseTo(0.5, 6);
  });
  it('trọng số cao hơn đóng góp nhiều hơn vào kết quả gộp', () => {
    const heavyA = combineLogOdds([{ name: 'a', probability: 0.9, weight: 10 }, { name: 'b', probability: 0.3, weight: 1 }], { shrinkStrength: 0 });
    const heavyB = combineLogOdds([{ name: 'a', probability: 0.9, weight: 1 }, { name: 'b', probability: 0.3, weight: 10 }], { shrinkStrength: 0 });
    expect(heavyA.probabilityBeforeShrink).toBeGreaterThan(0.5);
    expect(heavyB.probabilityBeforeShrink).toBeLessThan(0.5);
  });
});

describe('combineLogOdds: shrinkage', () => {
  it('trọng số thấp ⇒ shrink mạnh về 0,5 dù xác suất thô rất cao', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.99, weight: 0.5 }], { shrinkStrength: 4 });
    expect(r.probability).toBeGreaterThan(0.5);
    expect(r.probability).toBeLessThan(0.75); // bị kéo về gần 0,5 đáng kể
  });
  it('trọng số rất lớn ⇒ gần như không bị shrink', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.9, weight: 100_000 }], { shrinkStrength: 4 });
    expect(r.probability).toBeCloseTo(r.probabilityBeforeShrink, 3);
  });
  it('shrinkStrength = 0 ⇒ không shrink, bằng probabilityBeforeShrink', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.73, weight: 2 }], { shrinkStrength: 0 });
    expect(r.probability).toBeCloseTo(r.probabilityBeforeShrink, 8);
  });
  it('shrinkTo khác 0,5: không có tín hiệu ⇒ trả về đúng shrinkTo tuỳ chỉnh', () => {
    const r = combineLogOdds([], { shrinkTo: 0.3 });
    expect(r.probability).toBeCloseTo(0.3, 10);
  });
});

describe('combineLogOdds: contributions và tính chất số học', () => {
  it('share của các đóng góp cộng lại bằng 1', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.6, weight: 3 }, { name: 'b', probability: 0.4, weight: 7 }]);
    const sumShare = r.contributions.reduce((a, c) => a + c.share, 0);
    expect(sumShare).toBeCloseTo(1, 10);
  });
  it('probability luôn trong (0,1) kể cả đầu vào cực trị (0 hoặc 1)', () => {
    const r = combineLogOdds([{ name: 'a', probability: 1, weight: 5 }, { name: 'b', probability: 0, weight: 5 }]);
    expect(r.probability).toBeGreaterThan(0);
    expect(r.probability).toBeLessThan(1);
  });
  it('totalWeight bằng đúng tổng trọng số các tín hiệu hợp lệ', () => {
    const r = combineLogOdds([{ name: 'a', probability: 0.6, weight: 2.5 }, { name: 'b', probability: null, weight: 9 }, { name: 'c', probability: 0.4, weight: 1.5 }]);
    expect(r.totalWeight).toBeCloseTo(4, 10);
  });
});
