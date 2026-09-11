export type RRGQuadrant = "Leading" | "Weakening" | "Lagging" | "Improving";

export interface ConfluenceInput {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: RRGQuadrant;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
  // MOI (2026-09-11): -100 (dong tien rut manh) den +100 (dong tien vao
  // manh), tu calculatePVTTrendScore/calculateADTrendScore. null neu chua
  // du du lieu lich su (KHONG bi phat, xem normalizeTrendScore).
  pvtScore: number | null;
  adScore: number | null;
}

export interface WeightSet { rrg: number; rs: number; volume: number; pvt: number; ad: number; }

export interface ConfluenceResult extends ConfluenceInput {
  rrgScore: number;
  rsScore: number;
  volumeScore: number;
  pvtScoreNormalized: number; // 0-100
  adScoreNormalized: number;  // 0-100
  weightsUsed: WeightSet;
  confluenceScore: number;
}

const QUADRANT_SCORE: Record<RRGQuadrant, number> = { Leading: 100, Improving: 70, Weakening: 40, Lagging: 10 };

function scoreRS(rs: number | null): number {
  if (rs === null) return 0;
  return Math.max(0, Math.min(100, Math.round(((rs + 20) / 40) * 100)));
}

function scoreVolume(ratio: number | null): number {
  if (ratio === null) return 0;
  return Math.max(0, Math.min(100, Math.round(((ratio - 0.5) / 2.5) * 100)));
}

// null (thieu du lieu lich su, VD ma moi len san) -> 50 (TRUNG LAP), KHONG
// phai 0 - tranh phat oan cac ma chi vi thieu du lieu, dung nguyen tac da
// ap dung xuyen suot du an (khong suy dien tieu cuc tu du lieu thieu).
function normalizeTrendScore(score: number | null): number {
  if (score === null) return 50;
  return Math.max(0, Math.min(100, Math.round((score + 100) / 2)));
}

// TRONG SO DONG (2026-09-11): thay the trong so co dinh 30/40/30 truoc day
// bang noi suy tuyen tinh theo Risk-On Index (0-100) da co san trong he
// thong (lib/scoring/weighted-macro-score.ts, dung DXY/VIX/US10Y - KHONG
// phai machine learning, hoan toan minh bach va kiem chung duoc).
//
// CO SO DINH LUONG: khi Risk-OFF (thi truong phong thu), RRG (do on dinh
// xu huong tuong doi) dang tin cay hon vi phan anh SU BEN VUNG cua dong
// tien qua nhieu tuan; khi Risk-ON (thi truong hung phan), cac chi bao
// dong tien tuc thoi (Volume/PVT/A-D) dang gia hon vi bat duoc song tang
// truoc khi RRG kip phan anh (RRG von co do tre do dung cua so 63 phien).
const WEIGHTS_RISK_OFF: WeightSet = { rrg: 0.35, rs: 0.30, volume: 0.10, pvt: 0.125, ad: 0.125 };
const WEIGHTS_RISK_ON: WeightSet = { rrg: 0.15, rs: 0.25, volume: 0.20, pvt: 0.20, ad: 0.20 };

export function computeDynamicWeights(riskOnScore: number): WeightSet {
  const t = Math.max(0, Math.min(100, riskOnScore)) / 100;
  return {
    rrg: WEIGHTS_RISK_OFF.rrg + (WEIGHTS_RISK_ON.rrg - WEIGHTS_RISK_OFF.rrg) * t,
    rs: WEIGHTS_RISK_OFF.rs + (WEIGHTS_RISK_ON.rs - WEIGHTS_RISK_OFF.rs) * t,
    volume: WEIGHTS_RISK_OFF.volume + (WEIGHTS_RISK_ON.volume - WEIGHTS_RISK_OFF.volume) * t,
    pvt: WEIGHTS_RISK_OFF.pvt + (WEIGHTS_RISK_ON.pvt - WEIGHTS_RISK_OFF.pvt) * t,
    ad: WEIGHTS_RISK_OFF.ad + (WEIGHTS_RISK_ON.ad - WEIGHTS_RISK_OFF.ad) * t,
  };
}

export function calculateConfluenceScore(input: ConfluenceInput, riskOnScore: number): ConfluenceResult {
  const weights = computeDynamicWeights(riskOnScore);
  const rrgScore = QUADRANT_SCORE[input.sectorQuadrant];
  const rsScore = scoreRS(input.rs3m);
  const volumeScore = scoreVolume(input.volumeSpikeRatio);
  const pvtScoreNormalized = normalizeTrendScore(input.pvtScore);
  const adScoreNormalized = normalizeTrendScore(input.adScore);

  const confluenceScore = Math.round(
    rrgScore * weights.rrg + rsScore * weights.rs + volumeScore * weights.volume +
    pvtScoreNormalized * weights.pvt + adScoreNormalized * weights.ad,
  );

  return { ...input, rrgScore, rsScore, volumeScore, pvtScoreNormalized, adScoreNormalized, weightsUsed: weights, confluenceScore };
}

export function rankTop20(inputs: ConfluenceInput[], riskOnScore: number): ConfluenceResult[] {
  return inputs
    .map((i) => calculateConfluenceScore(i, riskOnScore))
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, 20);
}
