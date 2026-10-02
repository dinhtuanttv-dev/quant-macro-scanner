import { describe, expect, it } from 'vitest';
import { DEFAULT_DECISION_THRESHOLDS, computeDecisionState } from '@/lib/cotuc/timing-v3/decision/compute-decision-state';
import type { DecisionInput } from '@/lib/cotuc/timing-v3/decision/compute-decision-state';
import { combineLogOdds } from '@/lib/cotuc/timing-v3/decision/log-odds-combiner';
import type { EntryPlanSummary } from '@/lib/cotuc/timing-v3/decision/entry-refinement';

function fullyOkEntryPlan(o: Partial<EntryPlanSummary> = {}): EntryPlanSummary {
  return {
    tranches: [{ offset: -10, fraction: 1 }],
    runTooFar: { percentile: 0.4, hasRunTooFar: false },
    invalidationLevel: 90,
    invalidated: false,
    timeStopped: false,
    pauseFurtherEntries: false,
    ...o,
  };
}

function baseInput(o: Partial<DecisionInput> = {}): DecisionInput {
  return {
    action: 'IN_WINDOW',
    combined: combineLogOdds([{ name: 'a', probability: 0.75, weight: 10 }], { shrinkStrength: 0 }),
    entryPlan: fullyOkEntryPlan(),
    marketRegime: 'RISK_ON',
    dateStatus: 'CONFIRMED',
    earningsConflict: 'NONE',
    liquidityOk: true,
    ...o,
  };
}

describe('computeDecisionState: FAVORABLE', () => {
  it('mọi điều kiện đạt ⇒ FAVORABLE, checklist toàn PASS, headline nêu xác suất', () => {
    const r = computeDecisionState(baseInput());
    expect(r.level).toBe('FAVORABLE');
    expect(r.headline).toContain('Thuận lợi');
    expect(r.checks.every((c) => c.passed !== false)).toBe(true);
    expect(r.disclaimer).toBe('NOT_INVESTMENT_ADVICE');
  });
  it('liquidityOk = null (chưa kiểm tra) KHÔNG chặn FAVORABLE', () => {
    const r = computeDecisionState(baseInput({ liquidityOk: null }));
    expect(r.level).toBe('FAVORABLE');
    expect(r.checks.find((c) => c.key === 'liquidity')!.passed).toBeNull();
  });
});

describe('computeDecisionState: AVOID cứng (bất kể xác suất cao thế nào)', () => {
  it('action NO_SIGNAL ⇒ AVOID dù xác suất tổng hợp cao', () => {
    const r = computeDecisionState(baseInput({ action: 'NO_SIGNAL' }));
    expect(r.level).toBe('AVOID');
  });
  it.each(['NO_DATE', 'POST_EX', 'WINDOW_PASSED'] as const)('action %s ⇒ AVOID', (action) => {
    expect(computeDecisionState(baseInput({ action })).level).toBe('AVOID');
  });
  it('đã vô hiệu hoá theo ATR ⇒ AVOID dù xác suất cao và đang trong vùng mua', () => {
    const r = computeDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ invalidated: true, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('AVOID');
    expect(r.checks.find((c) => c.key === 'notInvalidated')!.passed).toBe(false);
  });
  it('đã hết thời gian (timeStopped) ⇒ AVOID', () => {
    const r = computeDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ timeStopped: true, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('AVOID');
  });
  it('xác suất tổng hợp dưới ngưỡng watch ⇒ AVOID dù action IN_WINDOW', () => {
    const weak = combineLogOdds([{ name: 'a', probability: 0.3, weight: 10 }], { shrinkStrength: 0 });
    const r = computeDecisionState(baseInput({ combined: weak }));
    expect(r.level).toBe('AVOID');
  });
});

describe('computeDecisionState: WATCH', () => {
  it('action TOO_EARLY với xác suất tốt ⇒ WATCH, không phải FAVORABLE (chưa tới vùng mua)', () => {
    const r = computeDecisionState(baseInput({ action: 'TOO_EARLY' }));
    expect(r.level).toBe('WATCH');
    expect(r.headline).toContain('Quan sát');
  });
  it('trong vùng mua nhưng xác suất ở vùng giữa hai ngưỡng ⇒ WATCH', () => {
    const mid = combineLogOdds([{ name: 'a', probability: 0.55, weight: 10 }], { shrinkStrength: 0 });
    const r = computeDecisionState(baseInput({ combined: mid }));
    expect(r.level).toBe('WATCH');
    expect(r.checks.find((c) => c.key === 'probability')!.passed).toBeNull();
  });
  it('giá đã chạy trước quá xa (nhưng chưa vô hiệu hoá) ⇒ WATCH, không phải AVOID cứng', () => {
    const r = computeDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ runTooFar: { percentile: 0.85, hasRunTooFar: true }, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('WATCH');
    expect(r.checks.find((c) => c.key === 'notRunTooFar')!.passed).toBe(false);
  });
  it('xung đột KQKD ⇒ WATCH dù mọi thứ khác tốt', () => {
    const r = computeDecisionState(baseInput({ earningsConflict: 'NEAR_EX' }));
    expect(r.level).toBe('WATCH');
    expect(r.headline).toContain('KQKD');
  });
  it('ngày chưa xác nhận (ANNOUNCED) ⇒ WATCH', () => {
    const r = computeDecisionState(baseInput({ dateStatus: 'ANNOUNCED' }));
    expect(r.level).toBe('WATCH');
  });
  it('thị trường RISK_OFF ⇒ WATCH dù các điều kiện riêng của mã đều tốt', () => {
    const r = computeDecisionState(baseInput({ marketRegime: 'RISK_OFF' }));
    expect(r.level).toBe('WATCH');
  });
  it('headline liệt kê đúng các điều kiện còn thiếu', () => {
    const r = computeDecisionState(baseInput({ dateStatus: 'ANNOUNCED', earningsConflict: 'NEAR_EX' }));
    expect(r.headline).toContain('Ngày sự kiện đã xác nhận');
    expect(r.headline).toContain('Không xung đột KQKD');
  });
});

describe('computeDecisionState: ngưỡng tuỳ chỉnh', () => {
  it('ngưỡng favorable cao hơn ⇒ cùng input trước đó là FAVORABLE nay chỉ là WATCH', () => {
    const r = computeDecisionState(baseInput(), { favorableProbability: 0.9, watchProbability: 0.5 });
    expect(r.level).toBe('WATCH');
  });
  it('DEFAULT_DECISION_THRESHOLDS export đúng giá trị mô tả trong docstring', () => {
    expect(DEFAULT_DECISION_THRESHOLDS.favorableProbability).toBe(0.6);
    expect(DEFAULT_DECISION_THRESHOLDS.watchProbability).toBe(0.5);
  });
});
