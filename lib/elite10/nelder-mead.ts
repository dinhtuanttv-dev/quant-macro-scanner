// Nelder-Mead Simplex Method (Nelder & Mead 1965) - VIET TAY, khong
// phu thuoc thu vien ngoai. Ly do: thu vien "fmin" (npm) KHONG tuong
// thich voi Turbopack (bundler production cua Next.js) - loi "module
// has no exports at all" khi build, du chay dung qua tsx (moi truong
// khac nhau ve xu ly ESM/CJS). Nelder-Mead la thuat toan don gian,
// well-known, de viet dung va test bang ham chuan.
//
// Thuat toan chuan (khong tu bia): moi vong lap sap xep simplex (n+1
// diem trong khong gian n chieu) theo gia tri ham, tinh centroid cua
// n diem tot nhat, thu Reflection/Expansion/Contraction/Shrink theo
// dung thu tu uu tien chuan.
export interface NelderMeadResult { x: number[]; fx: number; }
export interface NelderMeadOptions { maxIterations?: number; tolerance?: number; }

const ALPHA = 1; // reflection coefficient
const GAMMA = 2; // expansion coefficient
const RHO = 0.5; // contraction coefficient
const SIGMA = 0.5; // shrink coefficient

export function nelderMead(f: (x: number[]) => number, initial: number[], options: NelderMeadOptions = {}): NelderMeadResult {
  const maxIterations = options.maxIterations ?? 2000;
  const tolerance = options.tolerance ?? 1e-8;
  const n = initial.length;

  // Khoi tao simplex: diem dau + n diem lech 1 chieu (step 5% hoac 0.1
  // neu toa do = 0, tranh simplex suy bien).
  let simplex: number[][] = [initial.slice()];
  for (let i = 0; i < n; i++) {
    const point = initial.slice();
    point[i] += point[i] !== 0 ? point[i] * 0.05 : 0.1;
    simplex.push(point);
  }
  let values = simplex.map(f);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Sap xep simplex theo gia tri ham (tang dan: [0]=tot nhat, [n]=te nhat)
    const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    values = order.map(([v]) => v);

    // Dieu kien dung: do lech gia tri ham giua tot nhat va te nhat qua nho
    if (Math.abs(values[n] - values[0]) < tolerance) break;

    // Centroid cua n diem TOT NHAT (bo diem te nhat, index n)
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < n; d++) centroid[d] += simplex[i][d] / n;
    }

    const worst = simplex[n];
    // Reflection
    const reflected = centroid.map((c, d) => c + ALPHA * (c - worst[d]));
    const fReflected = f(reflected);

    if (fReflected < values[0]) {
      // Tot hon diem tot nhat -> thu Expansion
      const expanded = centroid.map((c, d) => c + GAMMA * (reflected[d] - c));
      const fExpanded = f(expanded);
      if (fExpanded < fReflected) { simplex[n] = expanded; values[n] = fExpanded; }
      else { simplex[n] = reflected; values[n] = fReflected; }
    } else if (fReflected < values[n - 1]) {
      // Tot hon diem te thu nhi -> chap nhan Reflection
      simplex[n] = reflected; values[n] = fReflected;
    } else {
      // Te hon diem te thu nhi -> Contraction
      const contracted = centroid.map((c, d) => c + RHO * (worst[d] - c));
      const fContracted = f(contracted);
      if (fContracted < values[n]) {
        simplex[n] = contracted; values[n] = fContracted;
      } else {
        // Contraction cung khong tot hon -> Shrink toan bo simplex ve diem tot nhat
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, d) => simplex[0][d] + SIGMA * (v - simplex[0][d]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }

  const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  return { x: simplex[order[0][1]], fx: order[0][0] };
}
