// Port từ locnganh-timing-engine (core/sector-regime-fusion.test.ts).
import { describe, expect, it } from 'vitest';
import { confluenceToProbability, fuseMacroAndTrendRegime, fuseSectorSignals } from "@/lib/locnganh/sector-regime-fusion";
import type { RegimeResult } from "@/lib/cotuc/timing-v3/decision/market-regime";
import type { ConfluenceStock } from "@/lib/locnganh/sector-types";

function trend(regime: RegimeResult['regime']): RegimeResult {
  return { regime, belowMa: regime !== 'RISK_ON', currentVolatility: 0.01, volatilityPercentile: 0.5, reasons: [] };
}

function confluence(score: number): ConfluenceStock {
  return {
    ticker: 'HPG', sectorKey: 'THEP', sectorQuadrant: 'IMPROVING', rs3m: 10, volumeSpikeRatio: 1.5,
    pvtScore: 20, adScore: 10, rrgScore: 70, rsScore: 65, volumeScore: 60, pvtScoreNormalized: 60, adScoreNormalized: 55,
    weightsUsed: { rrg: 0.25, rs: 0.25, volume: 0.25, pvt: 0.125, ad: 0.125 }, confluenceScore: score,
  };
}

function flatCloses(n: number): number[] {
  return new Array(n).fill(100).map((v, i) => v + Math.sin(i / 20) * 0.3);
}

describe('confluenceToProbability', () => {
  it('quy đổi tuyến tính 0-100 ⇒ [0,1]', () => {
    expect(confluenceToProbability(0)).toBe(0);
    expect(confluenceToProbability(100)).toBe(1);
    expect(confluenceToProbability(70)).toBeCloseTo(0.7, 10);
  });
  it('kẹp giá trị ngoài [0,100]', () => {
    expect(confluenceToProbability(-10)).toBe(0);
    expect(confluenceToProbability(150)).toBe(1);
  });
});

describe('fuseMacroAndTrendRegime', () => {
  it('macro RISK_OFF luôn thắng, bất kể trend', () => {
    expect(fuseMacroAndTrendRegime('RISK_OFF', trend('RISK_ON'))).toBe('RISK_OFF');
    expect(fuseMacroAndTrendRegime('RISK_OFF', trend('NEUTRAL'))).toBe('RISK_OFF');
  });
  it('macro RISK_ON + trend RISK_OFF ⇒ hạ xuống NEUTRAL, không đảo thành RISK_OFF', () => {
    expect(fuseMacroAndTrendRegime('RISK_ON', trend('RISK_OFF'))).toBe('NEUTRAL');
  });
  it('macro RISK_ON + trend tốt ⇒ giữ RISK_ON', () => {
    expect(fuseMacroAndTrendRegime('RISK_ON', trend('RISK_ON'))).toBe('RISK_ON');
    expect(fuseMacroAndTrendRegime('RISK_ON', trend('NEUTRAL'))).toBe('RISK_ON');
  });
  it('macro TRUNG_LAP ⇒ để trend quyết định hoàn toàn', () => {
    expect(fuseMacroAndTrendRegime('TRUNG_LAP', trend('RISK_OFF'))).toBe('RISK_OFF');
    expect(fuseMacroAndTrendRegime('TRUNG_LAP', trend('RISK_ON'))).toBe('RISK_ON');
    expect(fuseMacroAndTrendRegime('TRUNG_LAP', trend('NEUTRAL'))).toBe('NEUTRAL');
  });
});

describe('fuseSectorSignals', () => {
  it('cả hai tín hiệu cùng tích cực, thị trường tốt ⇒ xác suất gộp > 0,5', () => {
    const r = fuseSectorSignals({
      reactionProbability: 0.75, reactionProbabilityNEvents: 10,
      confluence: confluence(75), macroRegime: 'RISK_ON', vnIndexCloses: flatCloses(260),
    });
    expect(r.combined.probability).toBeGreaterThan(0.5);
    expect(r.marketRegime).toBe('RISK_ON');
  });
  it('thiếu reactionProbability (NO_SIGNAL) ⇒ vẫn chạy được, chỉ dùng Confluence', () => {
    const r = fuseSectorSignals({
      reactionProbability: null, reactionProbabilityNEvents: 0,
      confluence: confluence(80), macroRegime: 'TRUNG_LAP', vnIndexCloses: flatCloses(260),
    });
    expect(r.combined.contributions.map((c) => c.name)).toEqual(['Confluence Score']);
  });
  it('thiếu cả hai (chưa có ngành nào trong vũ trụ) ⇒ không crash, trả về trung tính', () => {
    const r = fuseSectorSignals({
      reactionProbability: null, reactionProbabilityNEvents: 0,
      confluence: null, macroRegime: 'TRUNG_LAP', vnIndexCloses: flatCloses(260),
    });
    expect(r.combined.probability).toBeCloseTo(0.5, 6);
  });
  it('macroRegime RISK_OFF làm giảm trọng số cả hai tín hiệu (shrink về 0,5 mạnh hơn)', () => {
    const base = { reactionProbability: 0.8, reactionProbabilityNEvents: 10, confluence: confluence(80), vnIndexCloses: flatCloses(260) };
    const riskOn = fuseSectorSignals({ ...base, macroRegime: 'RISK_ON' });
    const riskOff = fuseSectorSignals({ ...base, macroRegime: 'RISK_OFF' });
    expect(riskOff.combined.probability).toBeLessThan(riskOn.combined.probability);
  });
  it('dữ liệu VN-Index chưa đủ cho MA200 ⇒ không crash, trend NEUTRAL', () => {
    const r = fuseSectorSignals({
      reactionProbability: 0.7, reactionProbabilityNEvents: 5,
      confluence: confluence(60), macroRegime: 'RISK_ON', vnIndexCloses: flatCloses(50),
    });
    expect(r.trendDetail.regime).toBe('NEUTRAL');
    expect(r.marketRegime).toBe('RISK_ON'); // macro RISK_ON + trend NEUTRAL ⇒ vẫn RISK_ON
  });
});
