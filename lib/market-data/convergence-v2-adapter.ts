// Bộ lọc Hợp lưu v2 (Gateway) cho các route của Project A — thay /api/convergence-scan cũ (Yahoo chưa điều chỉnh, Wyckoff v1,
// OB/FVG không xét chiều). Nguồn: Market Gateway /api/market/strategies/convergence (quét sau ATC 15:45, chuỗi giá điều chỉnh
// cộng dồn, ~225 mã thanh khoản ≥ 5 tỷ). Kiểm định đặt trước: EXPERIMENTAL (không phải tín hiệu mua).
//
// Trả về đúng các trường mà Elite 10 watchlist và Decorrelation ngành (ta-vn-index/analyze) đang dùng:
//   { ticker, sector, wyckoffPhase, compositeScore } — CHỈ PHÍA MUA (cả hai nơi đều là danh sách mua).
// sector lấy theo stockUniverse của Project A (giữ nguyên cách so ngành cũ), thiếu thì dùng ngành của Gateway.
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { stockUniverse } from "@/lib/quant-data";

export interface ConvergenceLegacyResult {
  ticker: string;
  sector: string;
  wyckoffPhase: string;
  compositeScore: number;
  grade: "A" | "B" | "C";
  status: "READY" | "WATCH";
}

export interface ConvergenceV2Snapshot {
  source: "GATEWAY_CONVERGENCE_V2";
  engine: string | null;
  dataAsOf: string | null;
  generatedAt: string | null;
  evidenceLabel: string | null;
  results: ConvergenceLegacyResult[];
}

interface GatewayRow {
  ticker: string; sector?: string | null; side: "buy" | "sell"; status: "READY" | "WATCH"; grade: "A" | "B" | "C";
  metrics: { score: number }; wyckoff?: { phase?: string | null };
}

const sectorMap = new Map(stockUniverse.map((s) => [s.ticker, s.sector]));

/** Chuyển kết quả Gateway sang dạng cũ (chỉ phía mua). Tách riêng để test không cần mạng. */
export function toLegacyConvergence(doc: { engine?: string; dataAsOf?: string; generatedAt?: string; evidence?: { label?: string }; results?: GatewayRow[] }): ConvergenceV2Snapshot {
  const results = (doc.results ?? [])
    .filter((r) => r.side === "buy")
    .map((r) => ({
      ticker: r.ticker,
      sector: sectorMap.get(r.ticker) ?? r.sector ?? "-",
      wyckoffPhase: r.wyckoff?.phase ?? "undetermined",
      compositeScore: Number(r.metrics?.score) || 0,
      grade: r.grade,
      status: r.status,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
  return {
    source: "GATEWAY_CONVERGENCE_V2",
    engine: doc.engine ?? null, dataAsOf: doc.dataAsOf ?? null, generatedAt: doc.generatedAt ?? null,
    evidenceLabel: doc.evidence?.label ?? null,
    results,
  };
}

/** Đọc Hợp lưu v2 từ Gateway (timeout 15 s). Lỗi -> ném Error để route tự xử lý như trước. */
export async function fetchConvergenceV2(fetchImpl: typeof fetch = fetch): Promise<ConvergenceV2Snapshot> {
  const res = await fetchImpl(`${MARKET_GATEWAY_URL}/api/market/strategies/convergence`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gateway Hợp lưu v2 lỗi ${res.status}`);
  return toLegacyConvergence(await res.json());
}
