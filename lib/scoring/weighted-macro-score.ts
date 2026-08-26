// Weighted Macro Scoring - tinh Risk-On Index (0-100) tu 3 chi bao
// HARD_DATA: cong thuc xac dinh, trong so co the dieu chinh qua config

export interface MacroInputs {
  dxy: number;
  vix: number;
  treasury10y: number;
}

export interface RiskOnResult {
  score: number;
  status: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
  breakdown: { dxyScore: number; vixScore: number; treasuryScore: number };
  color: "green" | "amber" | "red";
}

const THRESHOLDS = {
  dxy: { safe: 102, danger: 105 },
  vix: { safe: 15, danger: 25 },
  treasury10y: { safe: 4.0, danger: 4.8 },
};

function normalizeInverse(value: number, safe: number, danger: number): number {
  if (value <= safe) return 100;
  if (value >= danger) return 0;
  return Math.round(((danger - value) / (danger - safe)) * 100);
}

export function calculateRiskOnIndex(inputs: MacroInputs): RiskOnResult {
  const dxyScore = normalizeInverse(inputs.dxy, THRESHOLDS.dxy.safe, THRESHOLDS.dxy.danger);
  const vixScore = normalizeInverse(inputs.vix, THRESHOLDS.vix.safe, THRESHOLDS.vix.danger);
  const treasuryScore = normalizeInverse(inputs.treasury10y, THRESHOLDS.treasury10y.safe, THRESHOLDS.treasury10y.danger);

  const score = Math.round(dxyScore * 0.4 + vixScore * 0.3 + treasuryScore * 0.3);

  let status: RiskOnResult["status"] = "NEUTRAL";
  let color: RiskOnResult["color"] = "amber";
  if (score >= 65) { status = "RISK_ON"; color = "green"; }
  else if (score <= 35) { status = "RISK_OFF"; color = "red"; }

  return { score, status, breakdown: { dxyScore, vixScore, treasuryScore }, color };
}
