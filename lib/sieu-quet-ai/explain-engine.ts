// Explain Engine - PORT TRUC TIEP tu explain.py (D.8).
//
// GHI CHU QUAN TRONG (giu nguyen tinh than ban goc): day la "pseudo-
// contribution" = trong so cong thuc x do lech so voi trung binh
// universe - giup nguoi dung hieu "yeu to nao keo diem len/xuong bao
// nhieu", KHONG PHAI Shapley value (SHAP) that (can mot ML model da
// huan luyen moi tinh duoc SHAP that - ngoai pham vi kha thi hien tai).

export interface ScoreExplainInput {
  faScore: number; taScore: number; eventImpactScore: number;
  confluenceBoost?: number;
  insiderClusterBuying?: boolean;
}

export interface ContributionRow {
  feature: string;
  shapValue: number;
  featureValue: number;
}

export interface ExplainResult {
  ticker: string;
  baseValue: number;
  topContributors: ContributionRow[];
}

export function explainSmartScore(
  ticker: string, item: ScoreExplainInput,
  universeAvg: { faScore: number; taScore: number; eventImpactScore: number }
): ExplainResult {
  const contributions: [string, number, number, number][] = [
    ["faScore", 0.40, item.faScore, universeAvg.faScore],
    ["taScore", 0.35, item.taScore, universeAvg.taScore],
    ["eventImpactScore", 0.25, item.eventImpactScore, universeAvg.eventImpactScore],
  ];
  if (item.confluenceBoost !== undefined) {
    contributions.push(["confluenceBoost", 0.12 * 30, item.confluenceBoost, 0.0]);
  }
  if (item.insiderClusterBuying) {
    contributions.push(["insiderClusterBuying", 3.0, 1, 0]);
  }

  const rows: ContributionRow[] = contributions.map(([name, weight, value, base]) => ({
    feature: name,
    shapValue: Math.round((name !== "confluenceBoost" ? (weight * (value - base)) / 100 : (weight * value) / 100) * 100) / 100,
    featureValue: value,
  }));
  rows.sort((a, b) => Math.abs(b.shapValue) - Math.abs(a.shapValue));

  const avgValues = Object.values(universeAvg);
  const baseValue = Math.round((avgValues.reduce((a, b) => a + b, 0) / Math.max(1, avgValues.length)) * 10) / 10;

  return { ticker, baseValue, topContributors: rows.slice(0, 5) };
}
