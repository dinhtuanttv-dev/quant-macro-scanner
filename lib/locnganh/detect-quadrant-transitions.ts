// Port từ locnganh-timing-engine (backend/sector-rotation/detect-quadrant-transitions.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * lib/locnganh/ (port từ gói locnganh-timing-engine: backend/sector-rotation/detect-quadrant-transitions.ts
 *
 * "Sự kiện" của engine ngành không phải GDKHQ hay ngày công bố KQKD — mà là lần một ngành
 * CHUYỂN GÓC PHẦN TƯ RRG, mặc định sang Improving (điểm vào kinh điển của chiến lược xoay vòng
 * ngành: RS-Ratio còn dưới 100 nhưng RS-Momentum đã vượt 100, nghĩa là đà tương đối đang quay
 * đầu trước khi hiệu suất tuyệt đối kịp vượt benchmark). Mọi hàm ở đây THUẦN, không I/O.
 */
import type { Quadrant, QuadrantTransition, RRGPoint } from "./sector-types";

/**
 * Phân loại góc phần tư từ RS-Ratio/RS-Momentum thô — đúng công thức trong tài liệu kế hoạch
 * gốc (mục 2.1). Dùng khi cần phân loại lại từ số thô, độc lập với trường `quadrant` đã có sẵn
 * trên RRGPoint (hai nguồn nên luôn khớp nhau; lệch nhau là dấu hiệu lỗi dữ liệu upstream).
 */
export function classifyQuadrant(rsRatio: number, rsMomentum: number): Quadrant {
  if (rsRatio >= 100 && rsMomentum >= 100) return 'LEADING';
  if (rsRatio < 100 && rsMomentum >= 100) return 'IMPROVING';
  if (rsRatio < 100 && rsMomentum < 100) return 'LAGGING';
  return 'WEAKENING'; // rsRatio >= 100 && rsMomentum < 100
}

/**
 * Quét lịch sử RRG của MỘT ngành (`history`, phải đã sắp theo `asOf` tăng dần — hàm không tự
 * sắp lại để tránh im lặng đảo thứ tự dữ liệu sai), trả về mọi lần chuyển VÀO `targetQuadrant`
 * (mặc định Improving). Chỉ tính lần chuyển THỰC SỰ (quadrant trước đó khác target) — ở nguyên
 * trong target nhiều kỳ liên tiếp không tính là nhiều sự kiện.
 */
export function detectQuadrantTransitions(history: RRGPoint[], targetQuadrant: Quadrant = 'IMPROVING'): QuadrantTransition[] {
  const out: QuadrantTransition[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (cur.quadrant === targetQuadrant && prev.quadrant !== targetQuadrant) {
      out.push({ sectorKey: cur.sectorKey, date: cur.asOf, fromQuadrant: prev.quadrant, toQuadrant: cur.quadrant });
    }
  }
  return out;
}

/** Mọi lần chuyển góc phần tư (không lọc theo đích) — dùng để vẽ vệt đuôi RRG Clock. */
export function detectAllTransitions(history: RRGPoint[]): QuadrantTransition[] {
  const out: QuadrantTransition[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (cur.quadrant !== prev.quadrant) {
      out.push({ sectorKey: cur.sectorKey, date: cur.asOf, fromQuadrant: prev.quadrant, toQuadrant: cur.quadrant });
    }
  }
  return out;
}

/** Lần chuyển vào `targetQuadrant` GẦN NHẤT tính đến (và bao gồm) cuối `history` — null nếu chưa từng. */
export function mostRecentTransitionInto(history: RRGPoint[], targetQuadrant: Quadrant = 'IMPROVING'): QuadrantTransition | null {
  const all = detectQuadrantTransitions(history, targetQuadrant);
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * true nếu điểm RRG mới nhất ĐANG ở `targetQuadrant` và việc chuyển vào xảy ra TRONG `history`
 * đang xét (không phải đã ở target từ trước khi dữ liệu bắt đầu) — dùng để biết "vừa vào" hay
 * "đã ở trong target một thời gian dài, không còn là tín hiệu mới".
 */
export function isFreshlyInQuadrant(history: RRGPoint[], targetQuadrant: Quadrant = 'IMPROVING'): boolean {
  if (history.length === 0) return false;
  const last = history[history.length - 1];
  if (last.quadrant !== targetQuadrant) return false;
  return mostRecentTransitionInto(history, targetQuadrant) !== null;
}
