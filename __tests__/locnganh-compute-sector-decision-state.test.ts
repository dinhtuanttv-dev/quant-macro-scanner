// Port từ locnganh-timing-engine (backend/decision-engine/compute-sector-decision-state.test.ts).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTOR_DECISION_THRESHOLDS, computeSectorDecisionState } from "@/lib/locnganh/compute-sector-decision-state";
import type { SectorDecisionInput } from "@/lib/locnganh/compute-sector-decision-state";
import { combineLogOdds } from "@/lib/cotuc/timing-v3/decision/log-odds-combiner";
import type { EntryPlanSummary } from "@/lib/cotuc/timing-v3/decision/entry-refinement";

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

function baseInput(o: Partial<SectorDecisionInput> = {}): SectorDecisionInput {
  return {
    action: 'IN_WINDOW',
    combined: combineLogOdds([{ name: 'a', probability: 0.75, weight: 10 }], { shrinkStrength: 0 }),
    entryPlan: fullyOkEntryPlan(),
    marketRegime: 'RISK_ON',
    transitionDateConfirmed: true,
    confluenceCorroborates: true,
    liquidityOk: true,
    ...o,
  };
}

describe('computeSectorDecisionState: FAVORABLE', () => {
  it('mọi điều kiện đạt ⇒ FAVORABLE, checklist toàn PASS', () => {
    const r = computeSectorDecisionState(baseInput());
    expect(r.level).toBe('FAVORABLE');
    expect(r.headline).toContain('Thuận lợi');
    expect(r.checks.every((c) => c.passed !== false)).toBe(true);
    expect(r.disclaimer).toBe('NOT_INVESTMENT_ADVICE');
  });
  it('liquidityOk = null (chưa kiểm tra) KHÔNG chặn FAVORABLE', () => {
    const r = computeSectorDecisionState(baseInput({ liquidityOk: null }));
    expect(r.level).toBe('FAVORABLE');
    expect(r.checks.find((c) => c.key === 'liquidity')!.passed).toBeNull();
  });
});

describe('computeSectorDecisionState: AVOID cứng', () => {
  it.each(['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'WINDOW_PASSED'] as const)('action %s ⇒ AVOID dù xác suất cao', (action) => {
    expect(computeSectorDecisionState(baseInput({ action })).level).toBe('AVOID');
  });
  it('đã vô hiệu hoá theo ATR ⇒ AVOID dù đang trong vùng mua', () => {
    const r = computeSectorDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ invalidated: true, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('AVOID');
    expect(r.checks.find((c) => c.key === 'notInvalidated')!.passed).toBe(false);
  });
  it('hết thời gian (timeStopped) ⇒ AVOID', () => {
    const r = computeSectorDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ timeStopped: true, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('AVOID');
  });
  it('xác suất tổng hợp dưới ngưỡng watch ⇒ AVOID dù action IN_WINDOW', () => {
    const weak = combineLogOdds([{ name: 'a', probability: 0.3, weight: 10 }], { shrinkStrength: 0 });
    expect(computeSectorDecisionState(baseInput({ combined: weak })).level).toBe('AVOID');
  });
});

describe('computeSectorDecisionState: WATCH', () => {
  it('action TOO_EARLY ⇒ WATCH, không phải FAVORABLE', () => {
    const r = computeSectorDecisionState(baseInput({ action: 'TOO_EARLY' }));
    expect(r.level).toBe('WATCH');
    expect(r.headline).toContain('Quan sát');
  });
  it('RS-Ratio đã chạy trước quá xa (nhưng chưa vô hiệu hoá) ⇒ WATCH', () => {
    const r = computeSectorDecisionState(baseInput({ entryPlan: fullyOkEntryPlan({ runTooFar: { percentile: 0.85, hasRunTooFar: true }, pauseFurtherEntries: true }) }));
    expect(r.level).toBe('WATCH');
    expect(r.checks.find((c) => c.key === 'notRunTooFar')!.passed).toBe(false);
  });
  it('Confluence Score mâu thuẫn với xác suất thống kê ⇒ WATCH', () => {
    const r = computeSectorDecisionState(baseInput({ confluenceCorroborates: false }));
    expect(r.level).toBe('WATCH');
    expect(r.headline).toContain('Confluence');
  });
  it('ngày chuyển quadrant chưa chốt phiên ⇒ WATCH', () => {
    const r = computeSectorDecisionState(baseInput({ transitionDateConfirmed: false }));
    expect(r.level).toBe('WATCH');
  });
  it('thị trường RISK_OFF ⇒ WATCH dù các điều kiện riêng của ngành đều tốt', () => {
    const r = computeSectorDecisionState(baseInput({ marketRegime: 'RISK_OFF' }));
    expect(r.level).toBe('WATCH');
  });
  it('chưa có Confluence Score (null) ⇒ không bị coi là mâu thuẫn (false), nhất quán với cách null được xử lý ở mọi check khác (chỉ false mới chặn FAVORABLE)', () => {
    const r = computeSectorDecisionState(baseInput({ confluenceCorroborates: null }));
    expect(r.level).toBe('FAVORABLE');
    expect(r.checks.find((c) => c.key === 'confluenceAgrees')!.passed).toBeNull();
  });
});

describe('computeSectorDecisionState: ngưỡng tuỳ chỉnh', () => {
  it('ngưỡng favorable cao hơn ⇒ cùng input trước đó là FAVORABLE nay chỉ là WATCH', () => {
    const r = computeSectorDecisionState(baseInput(), { favorableProbability: 0.9, watchProbability: 0.5 });
    expect(r.level).toBe('WATCH');
  });
  it('DEFAULT_SECTOR_DECISION_THRESHOLDS đúng như mô tả', () => {
    expect(DEFAULT_SECTOR_DECISION_THRESHOLDS.favorableProbability).toBe(0.6);
    expect(DEFAULT_SECTOR_DECISION_THRESHOLDS.watchProbability).toBe(0.5);
  });
});
