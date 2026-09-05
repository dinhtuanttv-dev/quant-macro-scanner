// lib/catalyst/engine/computeCredibilityWeight.ts
//
// H1 - THAY THE MO HINH CREDIBILITY NHI PHAN BANG DUONG CONG HOI TU LIEN TUC.
//
// Van de goc: calculateEdgeImpact() cu chi co 2 muc credibilityWeight (1.0 hoac
// 0.5) dua vao sourceCredibility. Mot tin "rumor" duoc 5 nguon doc lap xac nhan
// van bi tinh yeu nhu tin "rumor" chi co 1 nguon - khong dung ve mat thong ke:
// cang nhieu nguon doc lap cung xac nhan 1 tin don, xac suat tin do la that
// CANG TANG (theo logic Bayes co ban), khong phai hang so co dinh.
//
// Giai phap: ham hoi tu mu (exponential convergence) - "rumor" bat dau tu 0.5,
// tiem can dan len 0.9 (KHONG BAO GIO bang 1.0 - luon giu khoang cach voi tin
// "confirmed" that su, vi ban chat van la chua duoc xac nhan chinh thuc du
// nhieu nguon dua tin). "confirmed" luon giu nguyen 1.0, khong dieu chinh them
// (da la muc tin cay toi da).
//
// Cong thuc: weight = base + (cap - base) * (1 - e^(-(n-1)/growthRate))
//   - n=1 (chi 1 nguon): weight = base = 0.5 (giong he cu, khong thay doi hanh vi)
//   - n=3: weight ~ 0.68
//   - n=5: weight ~ 0.79
//   - n=10: weight ~ 0.87 (tiem can 0.9, khong bao gio vuot)

const RUMOR_BASE = 0.5;
const RUMOR_CONVERGENCE_CAP = 0.9;
const GROWTH_RATE = 3; // hang so dieu chinh toc do hoi tu - lon hon = hoi tu cham hon

export function computeCredibilityWeight(
  sourceCredibility: "confirmed" | "rumor",
  corroborationCount: number
): number {
  if (sourceCredibility === "confirmed") {
    return 1.0; // da toi da, khong can dieu chinh
  }

  // sourceCredibility === "rumor": ap dung duong cong hoi tu theo so nguon xac nhan
  const n = Math.max(1, corroborationCount);
  const convergenceProgress = 1 - Math.exp(-(n - 1) / GROWTH_RATE);
  return RUMOR_BASE + (RUMOR_CONVERGENCE_CAP - RUMOR_BASE) * convergenceProgress;
}
