/**
 * backend/earnings-seasonality/compute-earnings-cycle-stats.ts
 *
 * Mở rộng Backtest Service (compute-cycle-stats.ts) cho SỰ KIỆN KQKD THEO QUÝ, tái dùng
 * gần như toàn bộ hạ tầng đã có — vì `computeWindowStat`/`computeFdrAcrossWindows` vốn đã
 * thuần theo "một danh sách mẫu sự kiện", không biết gì về "cổ tức" hay "KQKD".
 *
 * Hai điểm khác so với bản cổ tức (gộp cả năm), đúng yêu cầu nghiệp vụ:
 *
 * 1. SHRINKAGE 2 LỚP: một quý của một mã thường chỉ có 3-5 sự kiện lịch sử (ít hơn nhiều so
 *    với "mọi đợt cổ tức trong nhiều năm"). Lớp 1 (ticker → prior) đã có sẵn trong
 *    `computeWindowStat` qua `priorMean`/`betweenVar`. Ở đây ta tính lớp 2 TRƯỚC đó:
 *    prior không phải "0" hay "suy diễn thô từ chính mã" như bản mặc định, mà là trung bình
 *    liên mã CÙNG NGÀNH, CÙNG QUÝ (`computeIndustryQuarterPrior`) — closest thứ tài liệu v3
 *    mục 5.4 gọi là "leave-one-ticker-out ngoài mẫu của mã đó".
 *
 * 2. FDR GỘP TOÀN NĂM: thay vì hiệu chỉnh đa so sánh riêng từng quý (4 lần, mỗi lần "rẻ" hơn
 *    nên dễ lọt sai số loại I hơn), `computeFullYearEarningsCycleStats` gộp TẤT CẢ cửa sổ ×
 *    4 quý (ví dụ 5 cửa sổ × 4 quý = 20 giả thuyết) vào MỘT lần gọi `computeFdrAcrossWindows`
 *    — đúng tinh thần mục 5.5.2: "số cửa sổ ứng viên phải cố định trước khi chạy, kiểm định
 *    đồng thời".
 *
 * Ngoài ra, thay vì báo `winRate` là một con số, quý nào CÓ cửa sổ được chọn sẽ có thêm
 * `reactionProbability`: hậu nghiệm Beta-Binomial (core/beta-binomial.ts) — một PHÂN PHỐI,
 * không phải một điểm — cho biết xác suất CAR dương từ entry đến exit, kèm khoảng tin cậy.
 */
import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_COSTS,
  DEFAULT_GATING,
  computeFdrAcrossWindows,
  computeWindowStat,
  netReturnOfEvent,
  sampleVariance,
  type BootstrapConfig,
  type ComputedWindowStat,
  type CostConfig,
  type EventSample,
  type GatingConfig,
  type WindowCandidate,
} from '../compute-cycle-stats';
import { betaBinomialPosterior, estimatePriorFromRates } from './beta-binomial';
import type { BacktestWindow, EarningsCycleStatsV3, Quarter } from '../timing-types';

// ---------------------------------------------------------------------------
// Prior 2 lớp: ngành + quý
// ---------------------------------------------------------------------------

export interface IndustryQuarterPrior {
  /** Trung bình liên mã (cùng ngành, cùng quý, cùng cửa sổ) — dùng làm priorMean cho shrinkage. */
  priorMean: number;
  /** Phương sai GIỮA các mã (không phải trong một mã) — dùng làm betweenVar cho shrinkage. */
  betweenVar: number;
  /** Prior Beta cho xác suất phản ứng dương, ước lượng từ tỷ lệ thắng của các mã khác cùng nhóm. */
  winRatePriorAlpha0: number;
  winRatePriorBeta0: number;
  /** Số mã đã dùng để ước lượng prior — 0 nghĩa là prior trung tính hoàn toàn (Beta(1,1), mean=0). */
  nTickersUsed: number;
}

/**
 * Tính prior ngành+quý từ mẫu của CÁC MÃ KHÁC (không gồm mã đang xét — leave-one-out phải
 * được đảm bảo ở TẦNG GỌI, hàm này không tự loại trừ). `samplesPerTicker[i]` là toàn bộ
 * `EventSample[]` của MỘT mã khác, cho ĐÚNG quý và ĐÚNG cửa sổ đang xét.
 */
export function computeIndustryQuarterPrior(samplesPerTicker: EventSample[][], costs: CostConfig = DEFAULT_COSTS): IndustryQuarterPrior {
  const means: number[] = [];
  const winRates: number[] = [];
  for (const samples of samplesPerTicker) {
    if (samples.length === 0) continue;
    const nets = samples.map((s) => netReturnOfEvent(s, costs));
    means.push(nets.reduce((a, b) => a + b, 0) / nets.length);
    winRates.push(nets.filter((x) => x > 0).length / nets.length);
  }
  if (means.length === 0) {
    return { priorMean: 0, betweenVar: 1e-4, winRatePriorAlpha0: 1, winRatePriorBeta0: 1, nTickersUsed: 0 };
  }
  const priorMean = means.reduce((a, b) => a + b, 0) / means.length;
  const betweenVarRaw = means.length >= 2 ? sampleVariance(means) : Math.max(priorMean ** 2, 1e-4);
  const { alpha0, beta0 } = estimatePriorFromRates(winRates);
  return {
    priorMean,
    betweenVar: Math.max(betweenVarRaw, 1e-6),
    winRatePriorAlpha0: alpha0,
    winRatePriorBeta0: beta0,
    nTickersUsed: means.length,
  };
}

// ---------------------------------------------------------------------------
// Tính từng quý (chưa hiệu chỉnh FDR — pool ở computeFullYearEarningsCycleStats)
// ---------------------------------------------------------------------------

export interface EarningsCycleStatsOptions {
  costs?: CostConfig;
  gating?: GatingConfig;
  bootstrap?: BootstrapConfig;
  version: string;
  asOf: string;
  benchmark?: 'VNINDEX' | 'SECTOR';
}

interface QuarterComputation {
  quarter: Quarter;
  computed: ComputedWindowStat[];
  /** window.id → mảng lãi ròng từng sự kiện — cần lại SAU khi biết cửa sổ nào được chọn, để tính wins/losses cho Beta-Binomial. */
  netsByWindowId: Map<string, number[]>;
  prior: IndustryQuarterPrior;
  priorByWindow?: Record<string, IndustryQuarterPrior>;
}

function computeQuarterRaw(
  quarter: Quarter,
  candidates: WindowCandidate[],
  prior: IndustryQuarterPrior,
  opts: EarningsCycleStatsOptions,
  priorByWindow?: Record<string, IndustryQuarterPrior>,
): QuarterComputation {
  const costs = opts.costs ?? DEFAULT_COSTS;
  // Bổ sung (tích hợp Project A): prior đúng "cùng ngành, cùng quý, CÙNG CỬA SỔ" nếu có — cửa sổ 3 ngày và 20 ngày có
  // lợi suất trung bình khác hẳn nhau, gộp chung một prior sẽ co sai mức. Không truyền -> hành vi cũ (một prior/quý).
  const computed = candidates.map((c) => {
    const pr = priorByWindow?.[c.id] ?? prior;
    return computeWindowStat(c, {
      costs,
      gating: opts.gating,
      bootstrap: opts.bootstrap,
      priorMean: pr.priorMean,
      betweenVar: pr.betweenVar,
    });
  });
  const netsByWindowId = new Map(candidates.map((c) => [c.id, c.samples.map((s) => netReturnOfEvent(s, costs))]));
  return { quarter, computed, netsByWindowId, prior, priorByWindow };
}

/**
 * Lắp EarningsCycleStatsV3 cho CẢ 4 QUÝ của một mã cùng lúc — bắt buộc dùng hàm này thay vì
 * gọi tính từng quý riêng rẽ rồi tự ghép, vì bước hiệu chỉnh FDR PHẢI chạy trên toàn bộ
 * 4×N cửa sổ cùng lúc (đúng mục 5.5.2, xem docstring đầu file).
 */
export function computeFullYearEarningsCycleStats(
  ticker: string,
  byQuarter: Record<Quarter, { candidates: WindowCandidate[]; prior: IndustryQuarterPrior; priorByWindow?: Record<string, IndustryQuarterPrior> }>,
  opts: EarningsCycleStatsOptions,
): Record<Quarter, EarningsCycleStatsV3> {
  const gating = opts.gating ?? DEFAULT_GATING;
  const quarters: Quarter[] = [1, 2, 3, 4];
  const perQuarter = quarters.map((q) => computeQuarterRaw(q, byQuarter[q].candidates, byQuarter[q].prior, opts, byQuarter[q].priorByWindow));

  // --- Gộp TOÀN BỘ cửa sổ × 4 quý thành MỘT lần hiệu chỉnh đa so sánh ---
  const allComputed = perQuarter.flatMap((p) => p.computed);
  const allWindows = computeFdrAcrossWindows(allComputed, gating);

  const result = {} as Record<Quarter, EarningsCycleStatsV3>;
  let cursor = 0;
  for (const p of perQuarter) {
    const windows = allWindows.slice(cursor, cursor + p.computed.length);
    cursor += p.computed.length;

    const eligible = windows.filter((w) => w.selected);
    const best = eligible.reduce<BacktestWindow | null>(
      (acc, w) => (acc === null || w.netExpectancyLcb > acc.netExpectancyLcb ? w : acc),
      null,
    );

    let reactionProbability: EarningsCycleStatsV3['reactionProbability'] = null;
    if (best) {
      const nets = p.netsByWindowId.get(best.id) ?? [];
      const wins = nets.filter((x) => x > 0).length;
      const losses = nets.length - wins;
      const pr = p.priorByWindow?.[best.id] ?? p.prior;
      reactionProbability = betaBinomialPosterior(wins, losses, pr.winRatePriorAlpha0, pr.winRatePriorBeta0, gating.confidenceLevel);
    }

    result[p.quarter] = {
      ticker,
      version: opts.version,
      asOf: opts.asOf,
      eventType: 'EARNINGS',
      quarter: p.quarter,
      windows,
      selectedWindowId: best?.id ?? null,
      adjustedPriceBasis: 'ADJ_CLOSE',
      benchmark: opts.benchmark ?? 'VNINDEX',
      reactionProbability,
    };
  }
  return result;
}
