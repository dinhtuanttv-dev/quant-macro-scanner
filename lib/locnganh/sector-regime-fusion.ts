// Port từ locnganh-timing-engine (core/sector-regime-fusion.ts) — import trỏ sang lib/cotuc/timing-v3 đang chạy, logic giữ nguyên.
/**
 * core/sector-regime-fusion.ts — Gộp BA tín hiệu đã có/vừa tính thành MỘT xác suất, dùng
 * core/log-odds-combiner.ts tái dùng y nguyên từ cotuc-timing-engine:
 *
 * 1. Xác suất ngành outperform (Beta-Binomial) từ compute-sector-cycle-stats.ts — bằng chứng
 *    THỐNG KÊ, dựa trên lịch sử các lần chuyển quadrant của CHÍNH ngành này.
 * 2. Confluence Score ĐÃ CÓ SẴN trong LocNganhPanel (mục 2.3 tài liệu kế hoạch gốc — RRG+RS+
 *    Volume+PVT+A/D) — bằng chứng KỸ THUẬT hiện tại, không cần tính lại, chỉ chuẩn hoá về [0,1].
 * 3. Risk-On/Risk-Off macro score ĐÃ CÓ SẴN (weighted-macro-score.ts) HỢP NHẤT với MA200/phân
 *    vị biến động của VN-Index (core/market-regime.ts, tái dùng y nguyên) — bằng chứng về BỐI
 *    CẢNH THỊ TRƯỜNG CHUNG, tách biệt khỏi tín hiệu riêng của ngành.
 *
 * KHÔNG viết lại Confluence Score hay macro score — chỉ là cầu nối để chúng tham gia cùng xác
 * suất Bayes mới, đúng tinh thần "tái dùng, không viết chồng" đã nêu trong phần rà soát.
 */
import { combineLogOdds } from "@/lib/cotuc/timing-v3/decision/log-odds-combiner";
import type { CombinedProbability, WeightedSignal } from "@/lib/cotuc/timing-v3/decision/log-odds-combiner";
import { REGIME_WEIGHT_MULTIPLIER, classifyMarketRegime } from "@/lib/cotuc/timing-v3/decision/market-regime";
import type { MarketRegime, RegimeResult } from "@/lib/cotuc/timing-v3/decision/market-regime";
import type { ConfluenceStock, MacroRegime } from "./sector-types";
import { WORLD_SIGNAL_WEIGHT } from "./world-context";

/** Quy đổi Confluence Score (0-100, đã có sẵn) sang xác suất [0,1] cho log-odds-combiner. */
export function confluenceToProbability(confluenceScore: number): number {
  return Math.min(1, Math.max(0, confluenceScore / 100));
}

/**
 * Hợp nhất Risk-On/Off macro score (đã có sẵn, mục 2.2 tài liệu gốc) với MA200/biến động
 * VN-Index (market-regime.ts) thành MỘT MarketRegime duy nhất — ưu tiên macro score khi hai
 * nguồn mâu thuẫn, vì macro score là chỉ báo RỘNG hơn (tổng hợp nhiều chỉ báo dòng tiền), còn
 * MA200/biến động chỉ là một lớp xác nhận thêm; chỉ hạ xuống RISK_OFF khi macro TRUNG_LAP mà
 * MA200/biến động xấu, không đảo ngược một RISK_ON rõ ràng từ macro score.
 */
export function fuseMacroAndTrendRegime(macroRegime: MacroRegime, trend: RegimeResult): MarketRegime {
  if (macroRegime === 'RISK_OFF') return 'RISK_OFF';
  if (macroRegime === 'RISK_ON') return trend.regime === 'RISK_OFF' ? 'NEUTRAL' : 'RISK_ON';
  // TRUNG_LAP: để MA200/biến động quyết định
  return trend.regime;
}

const SHRINK_STRENGTH = 4;
const logit = (p: number) => { const c = Math.min(1 - 1e-6, Math.max(1e-6, p)); return Math.log(c / (1 - c)); };
const invLogit = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Bối cảnh thế giới là một bước cập nhật Bayes RIÊNG trên xác suất đã gộp (không đưa vào combineLogOdds): bộ gộp chuẩn hoá theo
 * trọng số TRUNG BÌNH nên thêm một tín hiệu trọng số thấp sẽ KHUẾCH ĐẠI các tín hiệu khác — một bối cảnh bất lợi khi đó lại làm
 * xác suất TĂNG (phát hiện bằng test). Ở đây: logit(p') = logit(p) + κ·logit(p_thế giới), κ = w / (W + w + shrink) < 1 —
 * đơn điệu (thuận -> tăng, bất lợi -> giảm), mức ảnh hưởng thấp và giảm khi bằng chứng khác (W) nhiều. Không usable -> giữ nguyên.
 */
export function applyWorldContext(combined: CombinedProbability, world: SectorRegimeFusionInput["world"], weight: number): CombinedProbability {
  if (!world?.usable || world.probability === null || !(weight > 0)) return combined;
  const kappa = weight / (combined.totalWeight + weight + SHRINK_STRENGTH);
  const delta = kappa * logit(world.probability);
  return {
    ...combined,
    probability: invLogit(logit(combined.probability) + delta),
    contributions: [...combined.contributions, { name: 'Bối cảnh thế giới (ngoài mẫu)', probability: world.probability, weight, logOdds: logit(world.probability), share: kappa }],
    totalWeight: combined.totalWeight + weight,
  };
}

export interface SectorRegimeFusionInput {
  /** Xác suất outperform đã tính (Beta-Binomial) cho cửa sổ được chọn — null nếu NO_SIGNAL. */
  reactionProbability: number | null;
  /** Số sự kiện lịch sử đã dùng để tính reactionProbability — quyết định trọng số của nó. */
  reactionProbabilityNEvents: number;
  confluence: ConfluenceStock | null;
  macroRegime: MacroRegime;
  vnIndexCloses: number[];
  /**
   * Bối cảnh thế giới (Kết nối thế giới, gói macro-center 1.2): xác suất đã hiệu chỉnh theo tỷ lệ đúng hướng NGOÀI MẪU, chỉ có
   * khi cổng kiểm định ngoài mẫu đạt trên số liệu thật (`usable`). Không truyền / không usable -> trọng số 0, kết quả không đổi.
   */
  world?: { usable: boolean; probability: number | null } | null;
}

export interface SectorRegimeFusionResult {
  combined: CombinedProbability;
  marketRegime: MarketRegime;
  trendDetail: RegimeResult;
}

/**
 * Trọng số mặc định: xác suất thống kê (nếu có) được ưu tiên hơn Confluence vì nó đã qua cổng
 * FDR/OOS; Confluence bổ sung bằng chứng kỹ thuật hiện tại mà thống kê lịch sử không bắt được
 * (ví dụ khối lượng đột biến tuần này). Trọng số macro regime nhân thêm hệ số theo RISK_ON/
 * RISK_OFF (REGIME_WEIGHT_MULTIPLIER từ market-regime.ts) để tự động hạ ảnh hưởng khi thị
 * trường chung xấu, KHÔNG cần một tín hiệu "market" riêng cộng vào combineLogOdds.
 */
export function fuseSectorSignals(input: SectorRegimeFusionInput): SectorRegimeFusionResult {
  const trend = classifyMarketRegime({ closes: input.vnIndexCloses });
  const marketRegime = fuseMacroAndTrendRegime(input.macroRegime, trend);
  const regimeMultiplier = REGIME_WEIGHT_MULTIPLIER[marketRegime];

  const signals: WeightedSignal[] = [
    {
      name: 'Xác suất outperform (lịch sử)',
      probability: input.reactionProbability,
      weight: input.reactionProbability === null ? 0 : input.reactionProbabilityNEvents * regimeMultiplier,
    },
    {
      name: 'Confluence Score',
      probability: input.confluence ? confluenceToProbability(input.confluence.confluenceScore) : null,
      weight: input.confluence ? 4 * regimeMultiplier : 0,
    },
  ];

  const combined = applyWorldContext(combineLogOdds(signals, { shrinkStrength: SHRINK_STRENGTH }), input.world, WORLD_SIGNAL_WEIGHT * regimeMultiplier);
  return { combined, marketRegime, trendDetail: trend };
}
