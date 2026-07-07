// types.ts
// Kiến trúc: 1 CatalystSource (sự kiện gốc, có thể được NHIỀU nguồn khác nhau xác nhận)
// sinh ra N ImpactEdge (đường lan tác động). Khi 2 nguồn khác nhau đưa tin về CÙNG 1 sự kiện,
// hệ thống gộp thành 1 CatalystSource + thêm SourceReference, KHÔNG tạo edge trùng lặp.

export type CatalystCategory =
  | "earnings" | "ma" | "regulatory" | "rating" | "contract" | "insider" | "macro";

export type CatalystCredibility = "confirmed" | "rumor";

export type PropagationDistance =
  | "direct" | "upstream" | "downstream" | "competitor" | "commodity";

export type ImpactDirection = "benefit" | "harm";

export type Horizon = "short" | "medium" | "long";

export type TargetType = "sector" | "ticker";

export interface CatalystSource {
  id: string;
  title: string;
  category: CatalystCategory;
  sourceCredibility: CatalystCredibility;
  publishedDate: Date;
  executionDate?: Date | null;
  firstDetectedAt: Date;
  corroborationCount: number;
  sourceUrl?: string | null;
  targetPrice?: number | null;
}

export interface SourceReference {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  discoveredAt: Date;
}

export interface ImpactEdge {
  id: string;
  sourceId: string;
  targetType: TargetType;
  targetId: string;
  direction: ImpactDirection;
  propagationDistance: PropagationDistance;
  hopCount: number;
  baseWeight: number;
  decayRate: number;
  horizon: Horizon;
}

export interface MarketSignal {
  ticker: string;
  priceInStatus: "reflected" | "not_reflected";
  volumeFlag: "confirmed" | "suspicious" | "none";
  foreignFlowDirection: "buy" | "sell" | "none";
  foreignFlowValue?: string;
  valuationPercentile: number;
  liquidityScore: number;
  isWatchlisted: boolean;
}

export interface CalibrationEntry {
  category: CatalystCategory;
  propagationDistance: PropagationDistance;
  historicalWinRate: number;
}

export interface AlertConfig {
  minSectorNetScore: number;
  maxDaysBeforeExecutionForAlert: number;
  minCorroborationCount: number;
}

export interface TriggeredAlert {
  type: "sector_threshold" | "execution_window" | "low_corroboration_warning";
  targetId: string;
  message: string;
}

export interface RawSourceRecord {
  title: string;
  category: CatalystCategory;
  sourceName: string;
  sourceUrl: string;
  sourceCredibility: CatalystCredibility;
  publishedDate: Date;
  executionDate?: Date | null;
  originRecordId?: string;

  direction: ImpactDirection;
  baseWeight: number;
  decayRate: number;
  horizon: Horizon;

  sectors: string[];
  tickers: string[];

  targetPrice?: number;
}