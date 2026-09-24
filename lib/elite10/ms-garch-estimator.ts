// Elite 10 - Muc F (Tech Spec v2) Giai doan 2/5: Uoc luong tham so
// MS-GARCH tu du lieu gia THAT, dung Maximum Likelihood + Nelder-Mead
// (thu vien "fmin", KHONG tu viet optimizer tu dau de giam rui ro sai
// sot o phan khong phai trong tam). TAI DUNG runHamiltonFilter() da co
// (Giai doan 1) de tinh log-likelihood cho MOI bo tham so thu.
//
// DAY LA BUOC RUI RO CAO NHAT trong Muc F (da canh bao truoc voi
// nguoi dung): khong co cong thuc dong, co the KHONG HOI TU hoac hoi
// tu ve nghiem khong dang tin voi du lieu it quan sat. MINH BACH bang
// cach tra ve ca "isConverged" + canh bao khi tham so gan bien gioi
// han (dau hieu dang ngo, khong che giau).
//
// TRANSFORM (bat buoc de Nelder-Mead - von la unconstrained optimizer -
// luon tim trong MIEN HOP LE): dung sigmoid/exp de ep tham so ve dung
// khoang gia tri hop ly ve mat kinh te luong (omega>0, 0<alpha<0.3,
// alpha+beta<0.98 dam bao stationarity co margin an toan, 0<p_ii<1).
import { nelderMead } from "./nelder-mead";
import { runHamiltonFilter, type MsGarchParams } from "./ms-garch-hamilton-filter";

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }
function logit(p: number): number { return Math.log(p / (1 - p)); }

/** x co 9 phan tu tu do: [mu, xOmega1, xAlpha1, xBeta1, xOmega2, xAlpha2, xBeta2, xP11, xP22] */
function transformParams(x: number[]): MsGarchParams {
  const mu = x[0];
  const omega1 = Math.exp(x[1]);
  const alpha1 = sigmoid(x[2]) * 0.3;
  const beta1 = sigmoid(x[3]) * (0.98 - alpha1);
  const omega2 = Math.exp(x[4]);
  const alpha2 = sigmoid(x[5]) * 0.3;
  const beta2 = sigmoid(x[6]) * (0.98 - alpha2);
  const p11 = sigmoid(x[7]);
  const p22 = sigmoid(x[8]);
  return {
    mu,
    regimes: [{ omega: omega1, alpha: alpha1, beta: beta1 }, { omega: omega2, alpha: alpha2, beta: beta2 }],
    transitionMatrix: [[p11, 1 - p11], [1 - p22, p22]],
  };
}

function negLogLikelihood(x: number[], returns: number[]): number {
  const params = transformParams(x);
  const result = runHamiltonFilter(returns, params);
  if (!isFinite(result.logLikelihood)) return 1e12;
  return -result.logLikelihood;
}

export interface MsGarchEstimationResult {
  params: MsGarchParams;
  logLikelihood: number;
  isConverged: boolean;
  warnings: string[];
}

/** Uoc luong tham so MS-GARCH tu chuoi return THAT, dung Nelder-Mead
 * maximize log-likelihood (minimize negative log-likelihood). Initial
 * guess: 2 regime KHOI TAO KHAC BIET RO RET (regime 1 "yen tinh" =
 * unconditionalVar*0.3, regime 2 "bien dong" = unconditionalVar*2) de
 * tranh optimizer bi "mac ket" o nghiem 2 regime giong het nhau
 * (local minimum pho bien trong MS-GARCH, da ghi nhan trong tai lieu
 * hoc thuat). */
export function estimateMsGarchParams(returns: number[]): MsGarchEstimationResult | null {
  if (returns.length < 60) return null; // can toi thieu du du lieu de uoc luong co y nghia

  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const unconditionalVar = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;

  // Initial guess (gia tri THAT mong muon, roi INVERSE-TRANSFORM ve x0)
  const x0 = [
    meanReturn, // mu
    Math.log(unconditionalVar * 0.3), // xOmega1 -> omega1 = unconditionalVar*0.3
    logit(0.08 / 0.3), // xAlpha1 -> alpha1 ~ 0.08
    logit(0.85 / (0.98 - 0.08)), // xBeta1 -> beta1 ~ 0.85
    Math.log(unconditionalVar * 2), // xOmega2 -> omega2 = unconditionalVar*2
    logit(0.1 / 0.3), // xAlpha2 -> alpha2 ~ 0.1
    logit(0.8 / (0.98 - 0.1)), // xBeta2 -> beta2 ~ 0.8
    logit(0.95), // xP11 -> p11 ~ 0.95 (regime "dinh")
    logit(0.9), // xP22 -> p22 ~ 0.9
  ];

  const solution = nelderMead((x: number[]) => negLogLikelihood(x, returns), x0, { maxIterations: 2000 });
  const params = transformParams(solution.x);
  const logLikelihood = -solution.fx;

  const warnings: string[] = [];
  const [r1, r2] = params.regimes;
  if (r1.alpha + r1.beta > 0.97) warnings.push("Regime 1: alpha+beta gần sát ngưỡng ổn định (0.98) — tham số có thể không đáng tin.");
  if (r2.alpha + r2.beta > 0.97) warnings.push("Regime 2: alpha+beta gần sát ngưỡng ổn định (0.98) — tham số có thể không đáng tin.");
  // MOI: kiem tra tung tham so RIENG LE sat bien (khong chi tong
  // alpha+beta) - VD alpha sat muc tran 0.3 cho phep, hoac omega gan
  // bang 0 (dau hieu regime khong co y nghia thong ke rieng biet, GARCH
  // suy bien ve gan nhu hang so).
  if (r1.alpha > 0.28) warnings.push("Regime 1: alpha gần sát ngưỡng tối đa cho phép (0.3) — tham số có thể không đáng tin.");
  if (r2.alpha > 0.28) warnings.push("Regime 2: alpha gần sát ngưỡng tối đa cho phép (0.3) — tham số có thể không đáng tin.");
  if (r1.omega < unconditionalVar * 0.01) warnings.push("Regime 1: omega gần bằng 0 — regime này có thể không có ý nghĩa thống kê riêng biệt (GARCH gần như suy biến).");
  if (r2.omega < unconditionalVar * 0.01) warnings.push("Regime 2: omega gần bằng 0 — regime này có thể không có ý nghĩa thống kê riêng biệt (GARCH gần như suy biến).");
  const p11 = params.transitionMatrix[0][0], p22 = params.transitionMatrix[1][1];
  if (p11 > 0.995 || p11 < 0.5) warnings.push("Xác suất duy trì regime 1 (p11) ở mức cực đoan — mô hình có thể không phân biệt được 2 regime rõ ràng.");
  if (p22 > 0.995 || p22 < 0.5) warnings.push("Xác suất duy trì regime 2 (p22) ở mức cực đoan — mô hình có thể không phân biệt được 2 regime rõ ràng.");
  // Neu 2 regime qua giong nhau (omega gan bang nhau) -> mo hinh khong
  // thuc su phat hien duoc "che do" nao ca, chi la 1 GARCH thong thuong.
  if (Math.abs(r1.omega - r2.omega) / Math.max(r1.omega, r2.omega) < 0.15) {
    warnings.push("2 regime có variance rất gần nhau — mô hình có thể không phân biệt được các chế độ biến động khác nhau với dữ liệu này.");
  }

  return { params, logLikelihood, isConverged: isFinite(logLikelihood), warnings };
}
