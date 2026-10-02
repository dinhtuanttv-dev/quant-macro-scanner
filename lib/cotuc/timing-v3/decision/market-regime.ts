/**
 * core/market-regime.ts — Hạ độ tin cậy của mọi tín hiệu theo sự kiện khi thị trường chung
 * đang xấu: lợi thế thống kê đo được trong quá khứ thường yếu đi hoặc đảo chiều khi chỉ số
 * tham chiếu (VN-Index) dưới đường trung bình dài hạn hoặc biến động đang cao bất thường.
 * Thuần, không I/O — nhận sẵn chuỗi giá đóng cửa đã sắp theo thời gian tăng dần.
 */

export type MarketRegime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';

export interface RegimeInput {
  /** Giá đóng cửa, cũ → mới. Tối thiểu cần `maWindow` điểm để có MA; ít hơn ⇒ trả NEUTRAL (chưa đủ dữ liệu). */
  closes: number[];
  maWindow?: number; // mặc định 200
  volatilityWindow?: number; // mặc định 20 (ngày) cho biến động thực hiện
  /** Độ dài lịch sử để tính PHÂN VỊ của biến động hiện tại — càng dài càng ổn định. Mặc định 252 (≈1 năm giao dịch). */
  volatilityLookback?: number;
  /** Phân vị biến động từ đó coi là "cao bất thường". Mặc định 0.8 (top 20% biến động nhất). */
  volatilityHighPercentile?: number;
}

export interface RegimeResult {
  regime: MarketRegime;
  belowMa: boolean | null;
  currentVolatility: number | null;
  volatilityPercentile: number | null;
  reasons: string[];
}

export function simpleMovingAverage(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

/** Biến động thực hiện (độ lệch chuẩn của log-return) theo cửa sổ trượt `window`, đơn vị: theo ngày (chưa annualize). */
export function realizedVolatility(closes: number[], window: number): (number | null)[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const out: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1 || 1);
    out[i] = Math.sqrt(variance); // out[i] tương ứng closes[i] vì rets[i-1] = ln(closes[i]/closes[i-1])
  }
  return out;
}

/** Phân vị (0..1) của giá trị cuối cùng trong `history` so với chính nó (không tính điểm cuối 2 lần). */
function percentileRankOfLast(history: number[]): number | null {
  const clean = history.filter((v): v is number => v !== null && Number.isFinite(v));
  if (clean.length < 2) return null;
  const last = clean[clean.length - 1];
  const rest = clean.slice(0, -1);
  const below = rest.filter((v) => v <= last).length;
  return below / rest.length;
}

export function classifyMarketRegime(input: RegimeInput): RegimeResult {
  const maWindow = input.maWindow ?? 200;
  const volWindow = input.volatilityWindow ?? 20;
  const volLookback = input.volatilityLookback ?? 252;
  const highPct = input.volatilityHighPercentile ?? 0.8;
  const closes = input.closes;
  const reasons: string[] = [];

  if (closes.length < maWindow) {
    return { regime: 'NEUTRAL', belowMa: null, currentVolatility: null, volatilityPercentile: null, reasons: ['Chưa đủ dữ liệu để tính MA — mặc định trung tính, không lạc quan cũng không bi quan'] };
  }

  const ma = simpleMovingAverage(closes, maWindow);
  const lastMa = ma[ma.length - 1];
  const lastClose = closes[closes.length - 1];
  const belowMa = lastMa !== null ? lastClose < lastMa : null;
  if (belowMa) reasons.push(`Giá đóng cửa dưới MA${maWindow}`);

  const vol = realizedVolatility(closes, volWindow);
  const currentVolatility = vol[vol.length - 1];
  const volHistory = vol.slice(-Math.min(volLookback, vol.length)).filter((v): v is number => v !== null);
  const volatilityPercentile = currentVolatility !== null ? percentileRankOfLast(volHistory) : null;
  const highVol = volatilityPercentile !== null && volatilityPercentile >= highPct;
  if (highVol) reasons.push(`Biến động thực hiện ở phân vị ${Math.round((volatilityPercentile ?? 0) * 100)}% (≥ ngưỡng ${Math.round(highPct * 100)}%)`);

  let regime: MarketRegime;
  if (belowMa && highVol) regime = 'RISK_OFF';
  else if (belowMa || highVol) regime = 'RISK_OFF'; // một trong hai điều kiện xấu là đủ để thận trọng — không cần cả hai
  else regime = 'RISK_ON';

  if (regime === 'RISK_ON') reasons.push(`Giá trên MA${maWindow}, biến động ở mức bình thường`);

  return { regime, belowMa, currentVolatility, volatilityPercentile, reasons };
}

/** Hệ số nhân trọng số bằng chứng theo chế độ thị trường — dùng làm weight cho log-odds-combiner. */
export const REGIME_WEIGHT_MULTIPLIER: Record<MarketRegime, number> = {
  RISK_ON: 1,
  NEUTRAL: 0.85,
  RISK_OFF: 0.55,
};
