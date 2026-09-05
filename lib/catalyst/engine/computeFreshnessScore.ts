// lib/catalyst/engine/computeFreshnessScore.ts
//
// M6 - THAY THE NGUONG NHI PHAN "isNew" (trong 2h hay khong) BANG DIEM SO LIEN TUC.
//
// Van de goc: SectorRanking.isNew la boolean, chi phan biet "moi phat hien trong
// 2 gio" hoac "khong moi" - mat thong tin ve MUC DO moi. Mot tin phat hien 5 phut
// truoc va 1 tin phat hien 1 gio 55 phut truoc deu bi gan isNew=true nhu nhau,
// dam bao khong the phan biet do "nong" cua tung nguon tin tren UI (vd dung de
// dieu chinh do sang cua hieu ung glow, hoac de sap xep uu tien trong dai "vua
// phat hien").
//
// Giai phap: ham decay mu voi half-life 2 gio (tuong duong nguong isNew cu, giu
// tinh tuong thich hanh vi) - tra ve 0-1, 1 = vua phat hien ngay luc nay, giam
// dan theo thoi gian, gan 0 sau ~8-10 gio (4-5 lan half-life).

const FRESHNESS_HALF_LIFE_HOURS = 2;

export function computeFreshnessScore(firstDetectedAt: Date): number {
  const hoursElapsed = (Date.now() - firstDetectedAt.getTime()) / (1000 * 3600);
  if (hoursElapsed < 0) return 1; // phong thu neu clock skew, khong tra ve am

  // Cong thuc decay chuan: score = 0.5 ^ (t / halfLife)
  const score = Math.pow(0.5, hoursElapsed / FRESHNESS_HALF_LIFE_HOURS);
  return Math.round(score * 1000) / 1000; // lam tron 3 chu so thap phan
}

// Giu tuong thich nguoc voi isNew boolean cu (nguong 2h) cho cac noi con dung
// gia tri boolean truc tiep, tranh phai sua toan bo UI cung luc.
export function isConsideredNew(firstDetectedAt: Date): boolean {
  const hoursElapsed = (Date.now() - firstDetectedAt.getTime()) / (1000 * 3600);
  return hoursElapsed <= 2;
}
