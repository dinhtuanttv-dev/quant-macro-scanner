// Elite 10 - Muc F (Tech Spec v2) Giai doan 3/5: Monte Carlo Simulation
// - dung tham so MS-GARCH da uoc luong (Giai doan 2) + trang thai
// regime HIEN TAI (tu Hamilton Filter, Giai doan 1) de mo phong hang
// nghin kich ban gia TUONG LAI, tinh dai phan vi (fan chart).
//
// KHAC BIET QUAN TRONG voi Filtering (Giai doan 1): trong filtering,
// regime la AN/xac suat (xi_{t|t}). Trong simulation, MOI kich ban
// "DRAW" 1 regime CU THE moi ngay (ngau nhien theo transition matrix),
// roi tinh gia THEO DUNG regime do - day la cach chuan de mo phong
// tuong lai khi khong con quan sat duoc gia that nua.
import type { MsGarchParams } from "./ms-garch-hamilton-filter";

/** Box-Muller transform - sinh so ngau nhien phan phoi chuan N(0,1). */
function randStandardNormal(): number {
  const u1 = Math.random(), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Draw 1 regime ngau nhien theo phan phoi roi rac [p1, p2] (p1+p2=1). */
function drawRegime(probs: [number, number]): 0 | 1 {
  return Math.random() < probs[0] ? 0 : 1;
}

export interface MonteCarloInput {
  params: MsGarchParams;
  lastFilteredProbs: [number, number]; // xac suat regime TAI THOI DIEM CUOI cung da quan sat
  lastRegimeVariances: [number, number]; // h_{i,T} tai thoi diem cuoi
  lastEpsSq: number; // eps_T^2 = (return_T - mu)^2, dung lam gia tri khoi dau cho GARCH recursion
  currentPrice: number;
  horizonDays: number;
  nSimulations: number;
}

export interface FanChartPoint { day: number; p10: number; p50: number; p90: number; medianReturn: number; }

export interface MonteCarloResult {
  fanChart: FanChartPoint[];
  currentRegimeProbs: [number, number]; // xac suat dang o regime 1/2 TAI THOI DIEM HIEN TAI (khong doi, chi de hien thi)
}

/** Chay Monte Carlo: MOI kich ban mo phong DOC LAP horizonDays ngay,
 * bat dau tu regime duoc "draw" theo lastFilteredProbs, CHUYEN REGIME
 * moi ngay theo transitionMatrix, tinh variance theo dung GARCH cua
 * regime dang o (KHONG con "aggregate theo xac suat" nhu filtering -
 * regime da la 1 gia tri CU THE trong tung kich ban). */
export function runMonteCarloSimulation(input: MonteCarloInput): MonteCarloResult {
  const { params, lastFilteredProbs, lastRegimeVariances, lastEpsSq, currentPrice, horizonDays, nSimulations } = input;
  const [p11] = params.transitionMatrix[0];
  const [p21] = params.transitionMatrix[1];

  // Ma tran gia (log-return tich luy) cho tung kich ban, tung ngay
  const pricePaths: number[][] = Array.from({ length: nSimulations }, () => new Array(horizonDays).fill(0));

  for (let sim = 0; sim < nSimulations; sim++) {
    let regime = drawRegime(lastFilteredProbs);
    let hPrev: [number, number] = [...lastRegimeVariances];
    let epsSqPrev = lastEpsSq;
    let price = currentPrice;

    for (let day = 0; day < horizonDays; day++) {
      // Chuyen regime theo transition matrix (tu regime HIEN TAI, khong
      // phai aggregate - day la diem khac Hamilton Filter).
      // p21 = P(chuyen tu regime2 sang regime1) da dinh nghia o tren ->
      // khi dang o regime 1 (index1): P(chuyen ve 0)=p21, P(giu o 1)=1-p21.
      const transitionProb: [number, number] = regime === 0 ? [p11, 1 - p11] : [p21, 1 - p21];
      regime = drawRegime(transitionProb);

      const r = params.regimes[regime];
      // Dung h cua regime HIEN TAI (khong phai aggregate ca 2 nhu
      // Hamilton Filter, vi trong simulation regime da la 1 gia tri CU
      // THE, khong con la xac suat nua).
      const hUsed = regime === 0 ? hPrev[0] : hPrev[1];
      const hNew = r.omega + r.alpha * epsSqPrev + r.beta * hUsed;

      const z = randStandardNormal();
      const ret = params.mu + Math.sqrt(Math.max(0, hNew)) * z;
      price = price * Math.exp(ret / 100); // gia su return tinh theo % (dung don vi nhu cac module khac trong du an)

      pricePaths[sim][day] = price;
      epsSqPrev = ret * ret;
      hPrev = regime === 0 ? [hNew, hPrev[1]] : [hPrev[0], hNew];
    }
  }

  // Tinh percentile 10/50/90 moi ngay tu N kich ban
  const fanChart: FanChartPoint[] = [];
  for (let day = 0; day < horizonDays; day++) {
    const pricesAtDay = pricePaths.map((path) => path[day]).sort((a, b) => a - b);
    const p10 = pricesAtDay[Math.floor(nSimulations * 0.1)];
    const p50 = pricesAtDay[Math.floor(nSimulations * 0.5)];
    const p90 = pricesAtDay[Math.floor(nSimulations * 0.9)];
    fanChart.push({ day: day + 1, p10, p50, p90, medianReturn: ((p50 - currentPrice) / currentPrice) * 100 });
  }

  return { fanChart, currentRegimeProbs: lastFilteredProbs };
}
