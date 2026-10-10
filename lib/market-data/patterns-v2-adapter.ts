// Pattern Scanner v2 (Martin Pring, Gateway pring/P4) cho các route của Project A — thay /api/pattern-scan cũ (Yahoo chưa điều chỉnh,
// chỉ 4 mẫu, báo cả mô hình đã kết thúc hàng trăm phiên). Nguồn: Market Gateway /api/market/strategies/patterns (quét sau ATC
// 15:45, chuỗi giá điều chỉnh cộng dồn, khung ngày + tuần). Kiểm định đặt trước P3: EXPERIMENTAL (không nhóm nào đạt ngoài mẫu).
//
// Trả về đúng dạng PatternMatch mà Elite 10 watchlist đang dùng — CHỈ mô hình TĂNG:
//   status "confirmed" = vừa phá vỡ / đã xác nhận / pullback; "forming" = đang hình thành gần điểm phá vỡ.
//   confidenceScore = điểm checklist minh bạch của Pring (0–100, chưa kiểm định — chỉ để giữ công thức Đồng thuận TA cũ).
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { stockUniverse } from "@/lib/quant-data";

export interface PatternLegacyMatch {
  ticker: string; sector: string; pattern: string; patternLabel: string; tag: string; confidenceScore: number; status: "forming" | "confirmed";
  timeframe: "D" | "W"; state: string;
}
export interface PatternsV2Snapshot {
  source: "GATEWAY_PATTERNS_V2"; engine: string | null; dataAsOf: string | null; generatedAt: string | null; evidenceLabel: string | null;
  matches: PatternLegacyMatch[];
}
interface GatewayPattern { timeframe: "D" | "W"; type: string; label: string; familyLabel?: string; dir: "bull" | "bear"; state: string; stateLabel: string; score: number }
interface GatewayRow { ticker: string; sector?: string | null; patterns?: GatewayPattern[] }

const ACTIVE = new Set(["BREAKOUT", "CONFIRMED", "PULLBACK"]);
const sectorMap = new Map(stockUniverse.map((s) => [s.ticker, s.sector]));

/** Chuyển kết quả Gateway sang dạng cũ: mỗi mã một mô hình tăng (đang hiệu lực trước, rồi đang hình thành; theo thứ tự trạng thái của Gateway). */
export function toLegacyPatterns(doc: { engine?: string; dataAsOf?: string; generatedAt?: string; evidence?: { label?: string }; results?: GatewayRow[] }): PatternsV2Snapshot {
  const matches: PatternLegacyMatch[] = [];
  for (const r of doc.results ?? []) {
    const bull = (r.patterns ?? []).filter((p) => p.dir === "bull");
    const p = bull.find((x) => ACTIVE.has(x.state)) ?? bull.find((x) => x.state === "FORMING");
    if (!p) continue;
    matches.push({
      ticker: r.ticker, sector: sectorMap.get(r.ticker) ?? r.sector ?? "-",
      pattern: p.type, patternLabel: p.label, tag: `${p.timeframe === "W" ? "Tuần" : "Ngày"} · ${p.stateLabel}`,
      confidenceScore: Number(p.score) || 0, status: ACTIVE.has(p.state) ? "confirmed" : "forming", timeframe: p.timeframe, state: p.state,
    });
  }
  return {
    source: "GATEWAY_PATTERNS_V2", engine: doc.engine ?? null, dataAsOf: doc.dataAsOf ?? null, generatedAt: doc.generatedAt ?? null,
    evidenceLabel: doc.evidence?.label ?? null, matches,
  };
}

/** Đọc Pattern Scanner v2 từ Gateway (timeout 15 s). Lỗi -> ném Error để route tự xử lý. */
export async function fetchPatternsV2(fetchImpl: typeof fetch = fetch): Promise<PatternsV2Snapshot> {
  const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/strategies/patterns`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gateway Pattern Scanner v2 lỗi ${res.status}`);
  return toLegacyPatterns(await res.json());
}
