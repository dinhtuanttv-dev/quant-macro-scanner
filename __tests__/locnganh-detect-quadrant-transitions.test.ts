// Port từ locnganh-timing-engine (backend/sector-rotation/detect-quadrant-transitions.test.ts).
import { describe, expect, it } from 'vitest';
import {
  classifyQuadrant,
  detectAllTransitions,
  detectQuadrantTransitions,
  isFreshlyInQuadrant,
  mostRecentTransitionInto,
} from "@/lib/locnganh/detect-quadrant-transitions";
import type { Quadrant, RRGPoint } from "@/lib/locnganh/sector-types";

function pt(date: string, rsRatio: number, rsMomentum: number, quadrant: Quadrant): RRGPoint {
  return { sectorKey: 'THEP', sectorLabel: 'Thép', rsRatio, rsMomentum, quadrant, asOf: date };
}

describe('classifyQuadrant', () => {
  it('đúng 4 góc theo công thức mục 2.1', () => {
    expect(classifyQuadrant(105, 105)).toBe('LEADING');
    expect(classifyQuadrant(95, 105)).toBe('IMPROVING');
    expect(classifyQuadrant(95, 95)).toBe('LAGGING');
    expect(classifyQuadrant(105, 95)).toBe('WEAKENING');
  });
  it('biên đúng 100 tính là "vượt" (>=), nhất quán giữa 4 nhánh', () => {
    expect(classifyQuadrant(100, 100)).toBe('LEADING');
    expect(classifyQuadrant(100, 99.999)).toBe('WEAKENING');
    expect(classifyQuadrant(99.999, 100)).toBe('IMPROVING');
  });
});

describe('detectQuadrantTransitions', () => {
  it('phát hiện đúng 1 lần chuyển vào Improving, bỏ qua các kỳ ở nguyên trong Improving', () => {
    const history = [
      pt('2026-01-01', 95, 95, 'LAGGING'),
      pt('2026-01-08', 96, 101, 'IMPROVING'), // ← chuyển vào
      pt('2026-01-15', 97, 102, 'IMPROVING'), // vẫn ở trong, KHÔNG tính thêm
      pt('2026-01-22', 98, 103, 'IMPROVING'),
    ];
    const r = detectQuadrantTransitions(history, 'IMPROVING');
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ sectorKey: 'THEP', date: '2026-01-08', fromQuadrant: 'LAGGING', toQuadrant: 'IMPROVING' });
  });
  it('phát hiện NHIỀU lần chuyển vào nếu ngành ra rồi vào lại', () => {
    const history = [
      pt('2026-01-01', 95, 95, 'LAGGING'),
      pt('2026-01-08', 96, 101, 'IMPROVING'),
      pt('2026-01-15', 94, 98, 'LAGGING'), // ra khỏi Improving
      pt('2026-01-22', 95, 102, 'IMPROVING'), // vào lại — lần 2
    ];
    expect(detectQuadrantTransitions(history, 'IMPROVING')).toHaveLength(2);
  });
  it('mảng rỗng hoặc 1 điểm ⇒ không có transition', () => {
    expect(detectQuadrantTransitions([])).toEqual([]);
    expect(detectQuadrantTransitions([pt('2026-01-01', 96, 101, 'IMPROVING')])).toEqual([]);
  });
  it('đã ở Improving ngay từ điểm đầu tiên ⇒ KHÔNG tính là transition (không biết trước đó là gì)', () => {
    const history = [pt('2026-01-01', 96, 101, 'IMPROVING'), pt('2026-01-08', 97, 102, 'IMPROVING')];
    expect(detectQuadrantTransitions(history, 'IMPROVING')).toEqual([]);
  });
  it('lọc đúng theo targetQuadrant khác Improving', () => {
    const history = [pt('2026-01-01', 96, 101, 'IMPROVING'), pt('2026-01-08', 105, 105, 'LEADING')];
    expect(detectQuadrantTransitions(history, 'LEADING')).toHaveLength(1);
    expect(detectQuadrantTransitions(history, 'WEAKENING')).toEqual([]);
  });
});

describe('detectAllTransitions', () => {
  it('đếm mọi lần đổi góc, không lọc đích', () => {
    const history = [
      pt('2026-01-01', 95, 95, 'LAGGING'),
      pt('2026-01-08', 96, 101, 'IMPROVING'),
      pt('2026-01-15', 105, 105, 'LEADING'),
      pt('2026-01-22', 105, 95, 'WEAKENING'),
    ];
    expect(detectAllTransitions(history)).toHaveLength(3);
  });
});

describe('mostRecentTransitionInto', () => {
  it('trả lần GẦN NHẤT, không phải lần đầu tiên', () => {
    const history = [
      pt('2026-01-01', 95, 95, 'LAGGING'),
      pt('2026-01-08', 96, 101, 'IMPROVING'),
      pt('2026-01-15', 94, 98, 'LAGGING'),
      pt('2026-01-22', 95, 102, 'IMPROVING'),
    ];
    expect(mostRecentTransitionInto(history, 'IMPROVING')?.date).toBe('2026-01-22');
  });
  it('chưa từng có ⇒ null', () => {
    expect(mostRecentTransitionInto([pt('2026-01-01', 95, 95, 'LAGGING')], 'IMPROVING')).toBeNull();
  });
});

describe('isFreshlyInQuadrant', () => {
  it('true khi điểm cuối ở target VÀ có transition trong lịch sử đang xét', () => {
    const history = [pt('2026-01-01', 95, 95, 'LAGGING'), pt('2026-01-08', 96, 101, 'IMPROVING')];
    expect(isFreshlyInQuadrant(history, 'IMPROVING')).toBe(true);
  });
  it('false khi điểm cuối KHÔNG ở target', () => {
    const history = [pt('2026-01-01', 96, 101, 'IMPROVING'), pt('2026-01-08', 94, 98, 'LAGGING')];
    expect(isFreshlyInQuadrant(history, 'IMPROVING')).toBe(false);
  });
  it('mảng rỗng ⇒ false, không ném lỗi', () => {
    expect(isFreshlyInQuadrant([], 'IMPROVING')).toBe(false);
  });
});
