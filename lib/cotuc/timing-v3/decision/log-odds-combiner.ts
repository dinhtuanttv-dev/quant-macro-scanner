/**
 * core/log-odds-combiner.ts — Kết hợp NHIỀU tín hiệu xác suất độc lập (cửa sổ cổ tức, mùa vụ
 * KQKD, xu hướng/RS, thanh khoản...) thành MỘT xác suất tổng hợp.
 *
 * Vì sao cộng ở không gian log-odds (logit) chứ không lấy trung bình cộng xác suất: xác suất
 * bị chặn trong [0,1] nên trung bình cộng "co lại" về giữa một cách sai lệch khi các tín hiệu
 * đều mạnh cùng chiều (hai tín hiệu 90% trung bình cộng vẫn chỉ ra 90%, nhưng nếu chúng ĐỘC
 * LẬP thì bằng chứng gộp phải mạnh hơn từng cái riêng). logit(p)=ln(p/(1-p)) không bị chặn,
 * cộng logit tương đương nhân log-likelihood ratio — đúng phép cập nhật Bayes khi các tín hiệu
 * độc lập có điều kiện.
 *
 * Vì sao có SHRINKAGE: các tín hiệu trong thực tế KHÔNG độc lập hoàn toàn (RS và mùa vụ có
 * thể cùng phản ánh một nguyên nhân), nên cộng logit thô sẽ tự tin THÁI QUÁ. `shrinkStrength`
 * kéo kết quả cuối về 0,5 theo tỷ lệ nghịch với tổng trọng số bằng chứng — càng nhiều tín hiệu
 * độc lập thật (trọng số cao) thì càng ít bị kéo, tín hiệu đơn lẻ/yếu bị kéo mạnh về trung tính.
 */

export interface WeightedSignal {
  name: string;
  /** null = tín hiệu này hiện không có (ví dụ chưa đủ dữ liệu) — bị loại khỏi tổ hợp, không tính là 0,5. */
  probability: number | null;
  /** Trọng số bằng chứng, > 0. Nên phản ánh độ tin cậy đã có (ví dụ n sự kiện, độ hẹp CI), không phải cảm tính. */
  weight: number;
}

export interface SignalContribution {
  name: string;
  probability: number;
  weight: number;
  logOdds: number;
  /** Tỷ trọng đóng góp thực tế vào tổng logit trước khi shrink (weight / tổng weight). */
  share: number;
}

export interface CombinedProbability {
  probability: number;
  /** Xác suất TRƯỚC khi shrinkage — để thấy shrinkage đã kéo bao nhiêu. */
  probabilityBeforeShrink: number;
  contributions: SignalContribution[];
  totalWeight: number;
}

const EPS = 1e-6;

function clampProb(p: number): number {
  return Math.min(1 - EPS, Math.max(EPS, p));
}

function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

function invLogit(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface CombineOptions {
  /** Xác suất trung tính để shrink về — mặc định 0,5 (không thiên vị). */
  shrinkTo?: number;
  /**
   * Độ mạnh shrinkage: hệ số nhân α = totalWeight / (totalWeight + shrinkStrength) áp cho logit
   * đã cộng. shrinkStrength càng lớn thì cần càng nhiều trọng số bằng chứng mới giữ được gần
   * logit thô. Mặc định 4 (~tương đương cần 4 đơn vị trọng số để giữ 50% cường độ tín hiệu).
   */
  shrinkStrength?: number;
}

/**
 * Cộng log-odds có trọng số rồi shrink về `shrinkTo`. Tín hiệu có `probability: null` bị loại
 * hoàn toàn (không đóng góp 0 hay 0,5). Không có tín hiệu nào hợp lệ ⇒ trả `shrinkTo`.
 */
export function combineLogOdds(signals: WeightedSignal[], options: CombineOptions = {}): CombinedProbability {
  const shrinkTo = options.shrinkTo ?? 0.5;
  const shrinkStrength = options.shrinkStrength ?? 4;
  const valid = signals.filter((s): s is WeightedSignal & { probability: number } => s.probability !== null && s.weight > 0);

  const totalWeight = valid.reduce((a, s) => a + s.weight, 0);
  if (valid.length === 0 || totalWeight <= 0) {
    return { probability: shrinkTo, probabilityBeforeShrink: shrinkTo, contributions: [], totalWeight: 0 };
  }

  const baseLogit = logit(shrinkTo);
  const contributions: SignalContribution[] = valid.map((s) => ({
    name: s.name,
    probability: s.probability,
    weight: s.weight,
    logOdds: logit(s.probability),
    share: s.weight / totalWeight,
  }));

  // Cộng logit có trọng số, chuẩn hoá theo TRỌNG SỐ TRUNG BÌNH (không phải tổng trọng số) — đây
  // là điểm mấu chốt để vừa cho phép nhiều tín hiệu ĐỒNG THUẬN củng cố lẫn nhau (bằng chứng cộng
  // dồn thật sự tăng), vừa không để MỘT tín hiệu đơn lẻ tự khuếch đại xác suất của chính nó chỉ
  // vì được gán trọng số lớn (một tín hiệu duy nhất luôn phải giữ nguyên đúng xác suất nó nói,
  // bất kể trọng số bao nhiêu — trọng số của nó khi đứng một mình chỉ ảnh hưởng tới mức shrink
  // ở bước sau, không ảnh hưởng tới hướng/độ lớn của chính nó):
  //   meanWeight = tổng trọng số / số tín hiệu
  //   Σ w_i·(logit(p_i) − baseLogit) / meanWeight
  // Với 1 tín hiệu: biểu thức trên luôn bằng đúng (logit(p_1) − baseLogit), không phụ thuộc w_1.
  // Với N tín hiệu cùng trọng số, cùng p: nhân đúng N lần — đúng ý "N bằng chứng độc lập cộng dồn".
  const meanWeight = totalWeight / valid.length;
  const summedDelta = contributions.reduce((a, c) => a + c.weight * (c.logOdds - baseLogit), 0) / meanWeight;
  const rawLogit = baseLogit + summedDelta;
  const probabilityBeforeShrink = invLogit(rawLogit);

  const alpha = totalWeight / (totalWeight + shrinkStrength);
  const shrunkLogit = baseLogit + alpha * (rawLogit - baseLogit);
  const probability = invLogit(shrunkLogit);

  return { probability, probabilityBeforeShrink, contributions, totalWeight };
}
