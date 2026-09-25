/**
 * candidate-windows.ts - anh xa 5 CUA SO CHUAN da co san (CYCLE_WINDOWS
 * trong dividend-cycle-engine.ts, dung tu truoc cho v2) SANG dinh dang
 * WindowCandidate ma computeCycleStats() (v3) can - GIU NGUYEN offset/
 * holdDays goc de nhat quan voi ket qua da kiem chung truoc do, chi
 * doi CACH BIEU DIEN (offset+holdDays -> entryFrom/entryTo/exitOffset).
 *
 * Quy uoc: exitOffset = entryTo + holdDays (mua o CUOI khoang entry,
 * ban sau khi giu holdDays ngay giao dich).
 */

export interface CandidateWindowDef {
  id: string; label: string;
  entryFrom: number; entryTo: number; exitOffset: number;
  holdsThroughEx: boolean;
}

// GIU NGUYEN offset/holdDays tu CYCLE_WINDOWS (dividend-cycle-engine.ts)
// - KHONG tu y doi so, dam bao nhat quan voi Tab B/C da co.
export const CANDIDATE_WINDOWS: CandidateWindowDef[] = [
  { id: 'w1', label: 'W1 · Gom sớm trước Mốc 1', entryFrom: -75, entryTo: -60, exitOffset: -60 + 60, holdsThroughEx: true },
  { id: 'w2', label: 'W2 · Trước họp ĐHĐCĐ', entryFrom: -30, entryTo: -15, exitOffset: -15 + 20, holdsThroughEx: true },
  { id: 'w3', label: 'W3 · Trước GDKHQ (an toàn)', entryFrom: -25, entryTo: -15, exitOffset: -15 + 18, holdsThroughEx: true },
  { id: 'w4', label: 'W4 · Ngay sau GDKHQ', entryFrom: 3, entryTo: 6, exitOffset: 6 + 4, holdsThroughEx: false },
  { id: 'w5', label: 'W5 · Sau khi CP/tiền về TK', entryFrom: 20, entryTo: 35, exitOffset: 35 + 15, holdsThroughEx: false },
];

/** Tap hop TAT CA offset can thiet (entryFrom/entryTo/exitOffset cua
 * moi cua so + 0 = ngay GDKHQ) - dau vao cho computeCyclePaths(), sap
 * xep tang dan, khong trung. */
export function buildRequiredOffsets(): number[] {
  const set = new Set<number>([0]);
  for (const w of CANDIDATE_WINDOWS) {
    set.add(w.entryFrom); set.add(w.entryTo); set.add(w.exitOffset);
  }
  return Array.from(set).sort((a, b) => a - b);
}
