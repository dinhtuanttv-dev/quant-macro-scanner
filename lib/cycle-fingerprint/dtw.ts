// lib/cycle-fingerprint/dtw.ts
//
// Dynamic Time Warping (DTW) THAT - quy hoach dong chuan O(n*m), khong dung
// thu vien ngoai. Dung de do "mau hinh gia co giong nhau khong" giua 2
// chuoi da chuan hoa (base=100), cho phep co gian/nen thoi gian nhe (khac
// Euclidean distance cung do dai co dinh tung diem mot).

/** Chuan hoa chuoi gia ve goc 100 tai diem dau tien - so sanh HINH DANG,
 * khong bi lech boi muc gia tuyet doi khac nhau giua cac giai doan/ma. */
export function normalizeToBase100(closes: number[]): number[] {
  if (closes.length === 0) return [];
  const base = closes[0];
  if (base === 0) return closes.map(() => 100);
  return closes.map((c) => (c / base) * 100);
}

/** Khoang cach DTW giua 2 chuoi so thuc (Euclidean cho tung cap diem trong
 * quy hoach dong). Gia tri cang NHO cang giong nhau. */
export function dtwDistance(seriesA: number[], seriesB: number[]): number {
  const n = seriesA.length;
  const m = seriesB.length;
  if (n === 0 || m === 0) return Infinity;

  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  D[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seriesA[i - 1] - seriesB[j - 1]);
      D[i][j] = cost + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }

  return D[n][m];
}
