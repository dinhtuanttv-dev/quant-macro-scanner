import { describe, expect, it } from 'vitest';
import { classifyMarketRegime, realizedVolatility, simpleMovingAverage } from '@/lib/cotuc/timing-v3/decision/market-regime';

describe('simpleMovingAverage', () => {
  it('null cho tới khi đủ cửa sổ, sau đó đúng trung bình trượt', () => {
    const ma = simpleMovingAverage([1, 2, 3, 4, 5], 3);
    expect(ma[0]).toBeNull();
    expect(ma[1]).toBeNull();
    expect(ma[2]).toBeCloseTo(2, 10); // (1+2+3)/3
    expect(ma[3]).toBeCloseTo(3, 10); // (2+3+4)/3
    expect(ma[4]).toBeCloseTo(4, 10); // (3+4+5)/3
  });
});

describe('realizedVolatility', () => {
  it('chuỗi hằng số (không biến động) ⇒ 0', () => {
    const vol = realizedVolatility([100, 100, 100, 100, 100], 3);
    expect(vol[vol.length - 1]).toBeCloseTo(0, 10);
  });
  it('biến động lớn hơn ⇒ giá trị lớn hơn', () => {
    const calm = realizedVolatility([100, 100.5, 100, 100.5, 100, 100.5], 4);
    const wild = realizedVolatility([100, 120, 90, 130, 80, 140], 4);
    expect(wild[wild.length - 1]!).toBeGreaterThan(calm[calm.length - 1]!);
  });
});

describe('classifyMarketRegime', () => {
  function flatSeries(n: number, value = 100): number[] {
    return new Array(n).fill(value);
  }

  it('chưa đủ dữ liệu cho MA ⇒ NEUTRAL, không suy diễn liều lĩnh', () => {
    const r = classifyMarketRegime({ closes: flatSeries(50), maWindow: 200 });
    expect(r.regime).toBe('NEUTRAL');
    expect(r.belowMa).toBeNull();
  });

  it('giá đi ngang, biến động thấp, đủ dữ liệu ⇒ RISK_ON', () => {
    const closes = flatSeries(260).map((v, i) => v + Math.sin(i / 30) * 0.5); // dao động rất nhỏ quanh 100
    const r = classifyMarketRegime({ closes, maWindow: 200, volatilityWindow: 20 });
    expect(r.regime).toBe('RISK_ON');
    expect(r.belowMa).toBe(false);
  });

  it('giá rơi mạnh xuống dưới MA200 ⇒ RISK_OFF, có lý do nêu rõ', () => {
    const flat = flatSeries(200, 100);
    const drop = Array.from({ length: 30 }, (_, i) => 100 - i * 2); // giảm liên tục xuống ~40
    const closes = [...flat, ...drop];
    const r = classifyMarketRegime({ closes, maWindow: 200, volatilityWindow: 20 });
    expect(r.regime).toBe('RISK_OFF');
    expect(r.belowMa).toBe(true);
    expect(r.reasons.join(' ')).toContain('MA200');
  });

  it('biến động tăng đột biến gần đây dù giá vẫn trên MA ⇒ RISK_OFF vì phân vị biến động cao', () => {
    const calm = flatSeries(230, 100).map((v, i) => v + (i % 2 === 0 ? 0.1 : -0.1));
    const spike = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 8 : -8)); // biến động rất mạnh, quanh MA
    const closes = [...calm, ...spike];
    const r = classifyMarketRegime({ closes, maWindow: 200, volatilityWindow: 10, volatilityHighPercentile: 0.8 });
    expect(r.volatilityPercentile).not.toBeNull();
    expect(r.volatilityPercentile!).toBeGreaterThan(0.7);
    expect(r.regime).toBe('RISK_OFF');
  });

  it('tuỳ chỉnh maWindow/volatilityWindow có hiệu lực', () => {
    const closes = flatSeries(60, 100);
    const r = classifyMarketRegime({ closes, maWindow: 50, volatilityWindow: 10 });
    expect(r.belowMa).not.toBeNull();
  });
});
