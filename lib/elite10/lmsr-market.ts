// Elite 10 - Muc A (Tech Spec v2): LMSR (Logarithmic Market Scoring
// Rule, Robin Hanson 2003) - mo phong "thi truong du doan" noi bo cho
// Multi-Agent Debate (Bull=Claude vs Bear=Gemini). MODULE HOAN TOAN
// MOI, THUAN TOAN HOC, CHUA GOI AI THAT (Giai doan 1/4).
//
// CONG THUC CHUAN (nhi phan Yes/No, khong tu bia):
//   C(q_yes, q_no) = b * ln(exp(q_yes/b) + exp(q_no/b))   // cost function
//   price_yes = exp(q_yes/b) / (exp(q_yes/b) + exp(q_no/b))
//   price_no  = 1 - price_yes
//
// b (liquidity parameter): cang LON, gia cang IT bien dong moi lan
// "trade" (thi truong "sau" hon). Chon b=10 - hop ly cho boi canh nay
// (khong phai tien that, chi la co che tong hop nhieu luan diem AI
// thanh 1 xac suat).
//
// "Trade": moi luot debate, agent dua ra % tin cay (confidence 0-100),
// CHUYEN DOI thanh delta (luong mua) vao dung phe cua no (Bull luon
// mua vao Yes, Bear luon mua vao No) - confidence cang cao, mua cang
// nhieu. maxDeltaPerTrade gioi han muc bien dong toi da 1 luot de tranh
// 1 lan tin cay 100% lam gia nhay vot phi ly.

export const LMSR_B = 10;
export const MAX_DELTA_PER_TRADE = 5;

export interface LmsrState { qYes: number; qNo: number; }

/** Cost function C(q_yes, q_no) - dung de tinh "chi phi" cua 1 trade
 * (khong phai tien that, chi la dai luong trung gian de bao dam cong
 * thuc dung chuan, khong bat buoc hien thi ra UI). */
export function lmsrCost(state: LmsrState, b: number = LMSR_B): number {
  return b * Math.log(Math.exp(state.qYes / b) + Math.exp(state.qNo / b));
}

/** Gia hien tai cua Yes (0-1, KHONG phai %) - dung softmax 2 lop. */
export function lmsrPriceYes(state: LmsrState, b: number = LMSR_B): number {
  const eYes = Math.exp(state.qYes / b);
  const eNo = Math.exp(state.qNo / b);
  return eYes / (eYes + eNo);
}

/** Chuyen doi confidence AI (0-100) thanh delta (luong mua) - tuyen
 * tinh don gian, gioi han boi maxDeltaPerTrade de tranh 1 luot lam gia
 * nhay qua manh. */
export function confidenceToDelta(confidencePct: number, maxDelta: number = MAX_DELTA_PER_TRADE): number {
  const clamped = Math.max(0, Math.min(100, confidencePct));
  return (clamped / 100) * maxDelta;
}

export interface LmsrTrade { side: "bull" | "bear"; confidencePct: number; delta: number; priceYesBefore: number; priceYesAfter: number; }

/** Ap dung 1 trade (1 luot debate cua 1 agent) vao market state, tra ve
 * state MOI + thong tin trade (de log/hien thi lich su bien dong gia). */
export function applyTrade(state: LmsrState, side: "bull" | "bear", confidencePct: number, b: number = LMSR_B): { newState: LmsrState; trade: LmsrTrade } {
  const priceYesBefore = lmsrPriceYes(state, b);
  const delta = confidenceToDelta(confidencePct);
  const newState: LmsrState = side === "bull"
    ? { qYes: state.qYes + delta, qNo: state.qNo }
    : { qYes: state.qYes, qNo: state.qNo + delta };
  const priceYesAfter = lmsrPriceYes(newState, b);
  return { newState, trade: { side, confidencePct, delta, priceYesBefore, priceYesAfter } };
}

/** Ap dung TOAN BO chuoi trade (1 debate session) theo dung THU TU thoi
 * gian, tra ve state cuoi cung + lich su tung buoc gia da di qua. */
export function runLmsrSession(trades: { side: "bull" | "bear"; confidencePct: number }[], b: number = LMSR_B): { finalState: LmsrState; finalPriceYesPct: number; history: LmsrTrade[] } {
  let state: LmsrState = { qYes: 0, qNo: 0 };
  const history: LmsrTrade[] = [];
  for (const t of trades) {
    const { newState, trade } = applyTrade(state, t.side, t.confidencePct, b);
    state = newState;
    history.push(trade);
  }
  return { finalState: state, finalPriceYesPct: Math.round(lmsrPriceYes(state, b) * 1000) / 10, history };
}
