// Port từ locnganh-timing-engine (core/probability-calibration.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * core/probability-calibration.ts — "Dự báo 70%" chỉ có nghĩa nếu trong số các lần hệ thống
 * từng nói "70%", khoảng 70% thực sự đúng. Đo bằng Brier score, sửa bằng isotonic regression
 * (Pool Adjacent Violators Algorithm — PAVA), thuật toán chuẩn cho hiệu chỉnh đơn điệu, không
 * giả định dạng hàm (khác Platt scaling vốn giả định sigmoid).
 */

export interface CalibrationPoint {
  /** Xác suất mô hình dự báo, đã sắp theo thứ tự tăng dần khi đưa vào PAVA. */
  predicted: number;
  /** Kết quả thực: 1 nếu đúng hướng, 0 nếu sai. */
  outcome: 0 | 1;
}

/** Trung bình bình phương sai số — càng thấp càng tốt (0 = hoàn hảo, 0.25 = đoán mù "luôn 50%"). */
export function brierScore(points: CalibrationPoint[]): number | null {
  if (points.length === 0) return null;
  const sum = points.reduce((a, p) => a + (p.predicted - p.outcome) ** 2, 0);
  return sum / points.length;
}

/**
 * Isotonic regression bằng PAVA: tìm dãy ĐƠN ĐIỆU KHÔNG GIẢM khớp `outcomes` (đã sắp theo
 * `predicted` tăng dần) tốt nhất theo bình phương tối thiểu có trọng số. Đây là bước lõi của
 * hiệu chỉnh: nó không giả định calibration curve có dạng cụ thể nào (tuyến tính, sigmoid...),
 * chỉ đòi hỏi "dự báo cao hơn thì tần suất đúng không được thấp hơn" — đúng bản chất một mô
 * hình xác suất tốt phải có.
 */
export function poolAdjacentViolators(values: number[], weights: number[]): number[] {
  if (values.length !== weights.length) throw new Error('poolAdjacentViolators: values và weights phải cùng độ dài');
  if (values.length === 0) return [];
  // Mỗi block: {sum trọng số, sum trọng số*giá trị, số điểm gốc}. Gộp block liền kề khi block
  // sau có trung bình THẤP HƠN block trước (vi phạm đơn điệu), lặp lại tới khi hết vi phạm.
  const blocks: { w: number; wv: number; count: number }[] = values.map((v, i) => ({ w: weights[i], wv: weights[i] * v, count: 1 }));
  const stack: typeof blocks = [];
  for (const b of blocks) {
    stack.push({ ...b });
    while (stack.length >= 2 && stack[stack.length - 2].wv / stack[stack.length - 2].w > stack[stack.length - 1].wv / stack[stack.length - 1].w) {
      const top = stack.pop()!;
      const prev = stack.pop()!;
      stack.push({ w: prev.w + top.w, wv: prev.wv + top.wv, count: prev.count + top.count });
    }
  }
  const out: number[] = [];
  for (const b of stack) {
    const mean = b.wv / b.w;
    for (let i = 0; i < b.count; i++) out.push(mean);
  }
  return out;
}

export interface CalibrationMap {
  /** Điểm neo đã hiệu chỉnh, `x` tăng dần — dùng để nội suy tuyến tính cho xác suất mới. */
  anchors: { x: number; y: number }[];
  n: number;
  brierBefore: number | null;
  brierAfter: number | null;
}

/**
 * Khớp một đường hiệu chỉnh từ dữ liệu lịch sử (dự báo, kết quả thực) rồi trả về một hàm áp
 * dụng cho xác suất MỚI qua nội suy tuyến tính giữa các điểm neo (ngoài hai đầu thì giữ
 * nguyên giá trị biên — không ngoại suy vượt dữ liệu quan sát được).
 */
export interface FitCalibrationOptions {
  /**
   * Số điểm tối thiểu để tiến hành hiệu chỉnh. Dưới ngưỡng này, isotonic regression trên mẫu
   * quá nhỏ dễ overfit nhiễu và LÀM HẠI hơn là không sửa gì — trả về ánh xạ đồng nhất (identity:
   * mọi neo trùng giá trị dự báo gốc) thay vì ép fit. Mặc định 30 (cùng quy ước với
   * `src/decision/calibration.ts` — xem HANDOFF.md mục 0.1 về việc hợp nhất hai module này).
   */
  minSamples?: number;
}

/** true nếu map này là "đồng nhất" — chưa đạt `minSamples` nên không hiệu chỉnh gì (mọi neo có y = x). */
export function isIdentityCalibrationMap(map: CalibrationMap): boolean {
  return map.anchors.length > 0 && map.anchors.every((a) => a.x === a.y);
}

export function fitCalibrationMap(points: CalibrationPoint[], options: FitCalibrationOptions = {}): CalibrationMap {
  const minSamples = options.minSamples ?? 30;
  const sorted = [...points].sort((a, b) => a.predicted - b.predicted);
  const n = sorted.length;
  if (n === 0) return { anchors: [], n: 0, brierBefore: null, brierAfter: null };

  if (n < minSamples) {
    // Dưới ngưỡng: trả ánh xạ đồng nhất (y = x cho từng giá trị dự báo riêng biệt) — applyCalibration
    // với map này luôn trả nguyên xác suất đầu vào, tương đương "không hiệu chỉnh".
    const distinctX = [...new Set(sorted.map((p) => p.predicted))].sort((a, b) => a - b);
    const anchors = distinctX.map((x) => ({ x, y: x }));
    const brierBefore = brierScore(sorted);
    return { anchors, n, brierBefore, brierAfter: brierBefore };
  }

  // Gộp các điểm có CÙNG giá trị dự báo thành một điểm có trọng số trước khi chạy PAVA. Đây là
  // cách xử lý ties CHUẨN cho isotonic regression: nếu không gộp trước, thứ tự tuỳ ý giữa các
  // điểm trùng x có thể khiến PAVA gán các giá trị fit KHÁC NHAU cho cùng một x — vô lý vì
  // hàm hiệu chỉnh phải là một hàm thực sự của x (mỗi x chỉ có một y).
  const groups: { x: number; sumOutcome: number; weight: number }[] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.x === p.predicted) {
      last.sumOutcome += p.outcome;
      last.weight += 1;
    } else {
      groups.push({ x: p.predicted, sumOutcome: p.outcome, weight: 1 });
    }
  }
  const groupMeans = groups.map((g) => g.sumOutcome / g.weight);
  const groupWeights = groups.map((g) => g.weight);
  const fittedGroups = poolAdjacentViolators(groupMeans, groupWeights);
  const anchors = groups.map((g, i) => ({ x: g.x, y: fittedGroups[i] }));

  // brierBefore/brierAfter tính trên TỪNG điểm gốc (không phải từng nhóm) để phản ánh đúng cỡ
  // mẫu thật. `groups` và `sorted` cùng thứ tự và kích thước nhóm khớp nhau (groups được dựng
  // bằng cách duyệt tuần tự `sorted`), nên trải fittedGroups[i] lặp lại theo weight là an toàn,
  // không cần so sánh lại giá trị thực (tránh sai số dấu phẩy động khi so sánh bằng x).
  const fittedPerPoint: number[] = [];
  groups.forEach((g, i) => {
    for (let k = 0; k < g.weight; k++) fittedPerPoint.push(fittedGroups[i]);
  });
  const brierBefore = brierScore(sorted);
  const brierAfter = brierScore(sorted.map((p, i) => ({ predicted: fittedPerPoint[i], outcome: p.outcome })));
  return { anchors, n, brierBefore, brierAfter };
}

/** Áp dụng CalibrationMap cho một xác suất mới bằng nội suy tuyến tính; kẹp ở hai đầu dữ liệu. */
export function applyCalibration(map: CalibrationMap, predicted: number): number {
  if (map.anchors.length === 0) return predicted;
  if (map.anchors.length === 1) return map.anchors[0].y;
  const { anchors } = map;
  if (predicted <= anchors[0].x) return anchors[0].y;
  if (predicted >= anchors[anchors.length - 1].x) return anchors[anchors.length - 1].y;
  for (let i = 1; i < anchors.length; i++) {
    if (predicted <= anchors[i].x) {
      const a = anchors[i - 1];
      const b = anchors[i];
      const t = b.x === a.x ? 0 : (predicted - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return anchors[anchors.length - 1].y;
}

export interface CalibrationBin {
  loPredicted: number;
  hiPredicted: number;
  meanPredicted: number;
  empiricalRate: number;
  count: number;
}

/** Chia dữ liệu thành `nBins` khoảng theo xác suất dự báo — dùng để VẼ biểu đồ độ tin cậy. */
export function calibrationBins(points: CalibrationPoint[], nBins = 10): CalibrationBin[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.predicted - b.predicted);
  const size = Math.ceil(sorted.length / nBins);
  const bins: CalibrationBin[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const chunk = sorted.slice(i, i + size);
    if (chunk.length === 0) continue;
    bins.push({
      loPredicted: chunk[0].predicted,
      hiPredicted: chunk[chunk.length - 1].predicted,
      meanPredicted: chunk.reduce((a, p) => a + p.predicted, 0) / chunk.length,
      empiricalRate: chunk.reduce((a, p) => a + p.outcome, 0) / chunk.length,
      count: chunk.length,
    });
  }
  return bins;
}
