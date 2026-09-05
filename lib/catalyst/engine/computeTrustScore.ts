// lib/catalyst/engine/computeTrustScore.ts
//
// Gop 3 tin hieu rieng le (corroborationCount, sourceCredibility, do moi) thanh
// DUNG 1 chi so 0-100 duy nhat - giai quyet van de nguoi dung phai tu cong nham
// nhieu badge rieng le tren card (da neu trong ra soat).
//
// Cong thuc co trong so, moi thanh phan co dong gop ro rang, de tinh chinh sau:
//   - Corroboration (40%): cang nhieu nguon doc lap xac nhan, cang dang tin
//     (bao hoa dan tu 5 nguon tro len - nguon thu 10 khong dang tin hon nguon thu 5)
//   - Credibility (35%): nguon "confirmed" dang tin gap doi "rumor"
//   - Recency (25%): tin cang moi phat hien cang co gia tri hanh dong
//     (decay theo ham exp, half-life ~21 ngay)

export interface TrustScoreInput {
  corroborationCount: number;
  sourceCredibility: "confirmed" | "rumor";
  firstDetectedAt: Date;
}

const WEIGHTS = {
  corroboration: 0.4,
  credibility: 0.35,
  recency: 0.25,
} as const;

const CORROBORATION_SATURATION = 5; // tu 5 nguon tro len, factor dat max = 1
const RECENCY_DECAY_DAYS = 30;      // hang so decay - 30 ngay giam con ~37%

function corroborationFactor(count: number): number {
  return Math.min(1, count / CORROBORATION_SATURATION);
}

function credibilityFactor(credibility: "confirmed" | "rumor"): number {
  return credibility === "confirmed" ? 1 : 0.5;
}

function recencyFactor(firstDetectedAt: Date): number {
  const daysSince = (Date.now() - firstDetectedAt.getTime()) / (1000 * 3600 * 24);
  return Math.exp(-Math.max(0, daysSince) / RECENCY_DECAY_DAYS);
}

export function computeTrustScore(input: TrustScoreInput): number {
  const weighted =
    corroborationFactor(input.corroborationCount) * WEIGHTS.corroboration +
    credibilityFactor(input.sourceCredibility) * WEIGHTS.credibility +
    recencyFactor(input.firstDetectedAt) * WEIGHTS.recency;

  return Math.round(weighted * 100);
}

// Nhan xet dang text ngan cho UI, di kem so diem
export function trustScoreLabel(score: number): string {
  if (score >= 80) return "Rat dang tin";
  if (score >= 60) return "Dang tin";
  if (score >= 40) return "Can theo doi them";
  return "Chua du co so";
}
