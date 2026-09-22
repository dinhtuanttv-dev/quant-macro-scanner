// PORT tu ai_pipeline.py (Phan VI - Da tac nhan AI + Validation Layer).
// FIX quan trong: _trade_scenario ban goc dung CONG THUC SUY DIEN
// (win_rate = 0.5 + score/250, sample_size mac dinh "142" neu thieu) -
// KHONG PHAI backtest that. O day THAY BANG WindowStat THAT da co tu
// Time Engine (Vung 2.5) khi co san cho ma dang xet - GIU logic
// Validation Layer (chong hallucination) y het ban goc.
import type { ConfluenceProfile } from "./confluence-scoring";
import type { WindowStat } from "./time-engine";

export interface CaseItem { point: string; sourceField: string; citedValue: string; dataStatus: string; }
export interface TradeScenario { winRate: number; sampleSize: number; buyZone: [number, number]; stopLoss: number; takeProfit: [number, number]; isEstimated: boolean; }
export interface FinalVerdict {
  ticker: string; scoreNormalized: number; confidenceInterval: [number, number]; starRating: number;
  sourcesUsed: string; crossTabConvergence: number; bullCase: CaseItem[]; bearCase: CaseItem[];
  tradeScenario: TradeScenario; riskFlags: string[]; generatedAt: string; warnings: string[];
}

const AI_PRICE_DEVIATION_LIMIT = 0.30;
const AI_MIN_SAMPLE_SIZE = 30;

export function fieldMatchesSource(caseItem: CaseItem, profile: ConfluenceProfile): boolean {
  const [pillar, key] = caseItem.sourceField.split(".");
  const src = profile.sources[pillar];
  if (!src) return false;
  return key === "" || key in src.raw || key in src;
}

function bullCase(profile: ConfluenceProfile): CaseItem[] {
  const cases: CaseItem[] = [];
  const ta = profile.sources.ta;
  if (ta && ta.raw.smc_ob_count !== undefined && ta.raw.smc_ob_count !== null) {
    cases.push({
      point: `${ta.raw.smc_ob_count} Order Block, ${ta.raw.fvg_count ?? 0} Fair Value Gap đang hỗ trợ vùng giá hiện tại.`,
      sourceField: "ta.smc_ob_count", citedValue: String(ta.raw.smc_ob_count), dataStatus: ta.status ?? "VALID",
    });
  }
  const div = profile.sources.dividend;
  if (div && div.raw.yield_pct) {
    cases.push({
      point: `Tỷ suất cổ tức ${div.raw.yield_pct}%/năm, cao hơn trung bình ngành.`,
      sourceField: "dividend.yield_pct", citedValue: String(div.raw.yield_pct), dataStatus: div.status ?? "VALID",
    });
  }
  return cases;
}

function bearCase(profile: ConfluenceProfile): CaseItem[] {
  const cases: CaseItem[] = [];
  const macro = profile.sources.macro;
  // FIX (ra soat 2026-09-22): truoc day chi check "key in raw" (ton tai
  // key), khong check GIA TRI THAT - gay hien thi "Khoi ngoai null, du
  // lieu tre ? ngay" khi foreign_flow_desc=null (key ton tai nhung rong).
  // GIO chi them case item khi CO GIA TRI THAT, khong bia/hien thi rac.
  if (macro && macro.raw.foreign_flow_desc !== null && macro.raw.foreign_flow_desc !== undefined) {
    cases.push({
      point: `Khối ngoại ${macro.raw.foreign_flow_desc}, dữ liệu trễ ${macro.raw.lag_days ?? "?"} ngày so với snapshot hiện tại.`,
      sourceField: "macro.foreign_flow", citedValue: String(macro.raw.foreign_flow_desc), dataStatus: macro.status ?? "STALE",
    });
  }
  return cases;
}

/** Trade Scenario: dung WindowStat THAT (Time Engine) neu co, KHONG dung
 * cong thuc suy dien nhu ban goc. Neu khong co du lieu that, danh dau
 * ro isEstimated=true va KHONG dua ra con so cu the (tra ve null-like). */
function tradeScenario(refPrice: number, currentWindow: WindowStat | null): TradeScenario {
  if (currentWindow && !currentWindow.isLowSample) {
    return {
      winRate: currentWindow.winRate,
      sampleSize: currentWindow.sampleSize,
      buyZone: [Math.round(refPrice * 0.99 * 100) / 100, Math.round(refPrice * 1.01 * 100) / 100],
      stopLoss: Math.round(refPrice * 0.965 * 100) / 100,
      takeProfit: [Math.round(refPrice * 1.07 * 100) / 100, Math.round(refPrice * 1.135 * 100) / 100],
      isEstimated: false,
    };
  }
  // Khong du du lieu that - tra ve gia tri trung lap, danh dau ro
  return {
    winRate: 0.5, sampleSize: currentWindow?.sampleSize ?? 0,
    buyZone: [Math.round(refPrice * 0.99 * 100) / 100, Math.round(refPrice * 1.01 * 100) / 100],
    stopLoss: Math.round(refPrice * 0.965 * 100) / 100,
    takeProfit: [Math.round(refPrice * 1.07 * 100) / 100, Math.round(refPrice * 1.135 * 100) / 100],
    isEstimated: true,
  };
}

export function runAiPipeline(
  profile: ConfluenceProfile, score: number, ci: [number, number], star: number,
  crossTabN: number, riskFlags: string[], refPrice: number, currentWindow: WindowStat | null, nAvailable: number
): FinalVerdict {
  const bull = bullCase(profile);
  const bear = bearCase(profile);
  const trade = tradeScenario(refPrice, currentWindow);

  const verdict: FinalVerdict = {
    ticker: profile.ticker, scoreNormalized: score, confidenceInterval: ci, starRating: star,
    sourcesUsed: `${nAvailable}/6`, crossTabConvergence: crossTabN,
    bullCase: bull, bearCase: bear, tradeScenario: trade, riskFlags,
    generatedAt: new Date().toISOString(), warnings: [],
  };
  return validateAiOutput(verdict, profile, refPrice);
}

/** Phan 6.4 - Validation Layer: loai bo luan diem khong trich dan duoc
 * nguon that, canh bao moc gia lech qua nguong, canh bao sample nho. */
export function validateAiOutput(verdict: FinalVerdict, profile: ConfluenceProfile, refPrice: number): FinalVerdict {
  const warnings: string[] = [];

  for (const key of ["bullCase", "bearCase"] as const) {
    const cases = verdict[key];
    const kept = cases.filter((c) => fieldMatchesSource(c, profile));
    if (kept.length < cases.length) warnings.push(`Đã loại ${cases.length - kept.length} luận điểm không trích dẫn được nguồn thật trong ${key}.`);
    verdict[key] = kept;
  }

  const priceChecks: [string, number][] = [
    ["buy_zone_low", verdict.tradeScenario.buyZone[0]], ["buy_zone_high", verdict.tradeScenario.buyZone[1]],
    ["stop_loss", verdict.tradeScenario.stopLoss],
    ["take_profit_low", verdict.tradeScenario.takeProfit[0]], ["take_profit_high", verdict.tradeScenario.takeProfit[1]],
  ];
  for (const [label, price] of priceChecks) {
    const deviation = Math.abs(price - refPrice) / refPrice;
    if (deviation > AI_PRICE_DEVIATION_LIMIT) {
      warnings.push(`Mốc giá ${label}=${price} lệch ${Math.round(deviation * 100)}% so với giá tham chiếu — đã gắn cờ, cần rà soát thủ công.`);
    }
  }

  if (verdict.tradeScenario.sampleSize < AI_MIN_SAMPLE_SIZE) {
    warnings.push(`Cỡ mẫu backtest chỉ ${verdict.tradeScenario.sampleSize} < ${AI_MIN_SAMPLE_SIZE} — độ tin cậy thấp.`);
  }
  if (verdict.tradeScenario.isEstimated) {
    warnings.push("Chưa có đủ dữ liệu lịch sử thật cho cửa sổ hiện tại — vùng mua/chốt lời là tham chiếu kỹ thuật, không dựa trên tỷ lệ thắng lịch sử.");
  }

  verdict.warnings = warnings;
  return verdict;
}
