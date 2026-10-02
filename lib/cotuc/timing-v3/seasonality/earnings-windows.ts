// Cửa sổ ứng viên quanh NGÀY CÔNG BỐ BCTC quý (offset = ngày giao dịch so với ngày công bố; 0 = ngày công bố).
// Gói cotuc-timing-engine chỉ có cửa sổ mẫu trong test; đây là 4 cửa sổ chuẩn theo nghiên cứu phản ứng KQKD:
//   E1 chạy trước công bố (rò rỉ / kỳ vọng), E2 nắm qua công bố (phản ứng), E3 ngắn sau công bố, E4 trôi giá sau công bố (PEAD).
// holdsThroughEx ở đây nghĩa là "nắm qua ngày công bố". Không cộng cổ tức (netDividendYield = 0) — chuỗi giá đã là
// tổng lợi suất sau thuế (total-return.ts) nên nếu có GDKHQ rơi vào cửa sổ thì cổ tức đã nằm trong giá.

import type { CandidateWindowDef } from "../candidate-windows";

export const EARNINGS_CANDIDATE_WINDOWS: CandidateWindowDef[] = [
  { id: "e1", label: "E1 · Chạy trước công bố", entryFrom: -15, entryTo: -10, exitOffset: -1, holdsThroughEx: false },
  { id: "e2", label: "E2 · Nắm qua công bố", entryFrom: -5, entryTo: -2, exitOffset: 3, holdsThroughEx: true },
  { id: "e3", label: "E3 · Ngắn sau công bố", entryFrom: 1, entryTo: 2, exitOffset: 7, holdsThroughEx: false },
  { id: "e4", label: "E4 · Trôi giá sau công bố (PEAD)", entryFrom: 1, entryTo: 3, exitOffset: 20, holdsThroughEx: false },
];

export function buildEarningsOffsets(): number[] {
  const set = new Set<number>([0]);
  for (const w of EARNINGS_CANDIDATE_WINDOWS) { set.add(w.entryFrom); set.add(w.entryTo); set.add(w.exitOffset); }
  return [...set].sort((a, b) => a - b);
}
