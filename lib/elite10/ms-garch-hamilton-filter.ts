// Elite 10 - Muc F (Tech Spec v2) Giai doan 1/5: Hamilton Filter cho
// Markov-Switching GARCH (Gray 1996 specification) - MODULE HOAN TOAN
// MOI, thuan toan hoc, chua uoc luong tham so (do la Giai doan 2).
//
// DINH NGHIA (Gray 1996, "path-independent" MS-GARCH - giai quyet dung
// van de "path dependency" ma cac dac ta MS-GARCH don gian gap phai -
// KHONG tu bia, dua theo cong thuc da xac nhan qua nhieu nguon hoc
// thuat duoc trich dan rong rai):
//
//   return: r_t = mu + eps_t, eps_t = sqrt(h_t) * z_t, z_t ~ N(0,1)
//   2 regime, moi regime i co GARCH(1,1) RIENG:
//     h_{i,t} = omega_i + alpha_i * eps_{t-1}^2 + beta_i * h_{t-1}
//   LUU Y QUAN TRONG (diem mau chot cua Gray): h_{t-1} O DAY LA
//   AGGREGATE variance (KHONG PHAI h_{i,t-1} rieng theo regime) =
//     h_{t-1} = SUM_i xi_{t-1|t-1}(i) * h_{i,t-1}
//   Day la cach Gray tranh "path dependency" (K^T duong di bung no to
//   hop) - vi eps_{t-1} quan sat duoc la 1 chuoi CHUNG, khong phan
//   biet theo regime.
//
//   Hamilton Filter (Hamilton 1989), 2 buoc moi t:
//     1. Prediction: xi_{t|t-1}(j) = SUM_i xi_{t-1|t-1}(i) * p_ij
//     2. Update (Bayes): xi_{t|t}(j) = xi_{t|t-1}(j)*f_j(r_t) / SUM_k[...]
//   trong do f_j(r_t) = Normal PDF cua r_t voi mean=mu, variance=h_{j,t}.
//
//   Log-likelihood dong gop tai t = log( SUM_j xi_{t|t-1}(j)*f_j(r_t) ).

export interface GarchRegimeParams { omega: number; alpha: number; beta: number; }

export interface MsGarchParams {
  mu: number;
  regimes: [GarchRegimeParams, GarchRegimeParams];
  // transitionMatrix[i][j] = P(regime tai t = j | regime tai t-1 = i)
  transitionMatrix: [[number, number], [number, number]];
}

export interface HamiltonFilterResult {
  filteredProbs: [number, number][]; // xi_{t|t}(1), xi_{t|t}(2) - tung t
  regimeVariances: [number, number][]; // h_{1,t}, h_{2,t} - tung t
  aggregateVariance: number[]; // h_t = weighted avg 2 regime - tung t
  logLikelihood: number; // tong log-likelihood toan bo chuoi
}

function normalPdf(x: number, mean: number, variance: number): number {
  if (variance <= 0) return 0;
  return Math.exp(-((x - mean) ** 2) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
}

/** Xac suat dung (stationary distribution) cua chuoi Markov 2 trang
 * thai - dung lam xi_{0|0} khoi tao. Cong thuc chuan: pi_1 =
 * (1-p22)/(2-p11-p22). */
function stationaryDistribution(p11: number, p22: number): [number, number] {
  const denom = 2 - p11 - p22;
  if (denom <= 0) return [0.5, 0.5]; // truong hop suy bien, ve trung lap
  const pi1 = (1 - p22) / denom;
  return [Math.max(0, Math.min(1, pi1)), Math.max(0, Math.min(1, 1 - pi1))];
}

/** Chay Hamilton Filter tren 1 chuoi return, voi 1 bo tham so CHO
 * TRUOC (chua uoc luong - Giai doan 2 se dung ham nay lam "black box"
 * de tinh log-likelihood, roi toi uu hoa tham so de maximize no). */
export function runHamiltonFilter(returns: number[], params: MsGarchParams): HamiltonFilterResult {
  const { mu, regimes, transitionMatrix } = params;
  const [p11, p12] = transitionMatrix[0];
  const [p21, p22] = transitionMatrix[1];
  void p12; void p21; // p12=1-p11, p21=1-p22 (rang buoc hang doi 1), khong dung truc tiep

  const T = returns.length;
  const filteredProbs: [number, number][] = [];
  const regimeVariances: [number, number][] = [];
  const aggregateVariance: number[] = [];
  let logLikelihood = 0;

  // Khoi tao: unconditional variance cua chuoi lam h_{i,0} CHO CA 2
  // regime (chua co thong tin de phan biet), xi_{0|0} = stationary dist.
  const meanReturn = returns.reduce((s, r) => s + r, 0) / T;
  const unconditionalVar = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / T;
  let hPrev: [number, number] = [unconditionalVar, unconditionalVar];
  let xiPrev: [number, number] = stationaryDistribution(p11, p22);
  let epsPrevSq = 0; // eps_0^2, chua co quan sat truoc do -> dung unconditionalVar lam proxy
  epsPrevSq = unconditionalVar;

  for (let t = 0; t < T; t++) {
    // Buoc 1: Prediction - xi_{t|t-1}(j) = SUM_i xi_{t-1|t-1}(i) * p_ij
    const xiPred1 = xiPrev[0] * p11 + xiPrev[1] * p21;
    const xiPred2 = xiPrev[0] * p12 + xiPrev[1] * p22;

    // Aggregate variance tai t-1 (Gray's key trick, tranh path dependency)
    const hAggPrev = xiPrev[0] * hPrev[0] + xiPrev[1] * hPrev[1];

    // GARCH(1,1) rieng moi regime, dung h AGGREGATE (khong phai
    // regime-specific) cho thanh phan beta*h_{t-1}
    const h1t = regimes[0].omega + regimes[0].alpha * epsPrevSq + regimes[0].beta * hAggPrev;
    const h2t = regimes[1].omega + regimes[1].alpha * epsPrevSq + regimes[1].beta * hAggPrev;

    // Likelihood moi regime
    const f1 = normalPdf(returns[t], mu, h1t);
    const f2 = normalPdf(returns[t], mu, h2t);

    // Buoc 2: Update (Bayes)
    const joint1 = xiPred1 * f1;
    const joint2 = xiPred2 * f2;
    const marginal = joint1 + joint2;

    const xi1t = marginal > 0 ? joint1 / marginal : xiPred1;
    const xi2t = marginal > 0 ? joint2 / marginal : xiPred2;

    filteredProbs.push([xi1t, xi2t]);
    regimeVariances.push([h1t, h2t]);
    const hAggT = xi1t * h1t + xi2t * h2t;
    aggregateVariance.push(hAggT);

    logLikelihood += marginal > 0 ? Math.log(marginal) : -1e10; // phat rat nang neu marginal=0 (tham so vo ly)

    // Cap nhat cho vong lap sau
    xiPrev = [xi1t, xi2t];
    hPrev = [h1t, h2t];
    epsPrevSq = (returns[t] - mu) ** 2;
  }

  return { filteredProbs, regimeVariances, aggregateVariance, logLikelihood };
}
