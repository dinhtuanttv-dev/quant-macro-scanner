// types.ts
// Kiến trúc: 1 CatalystSource (tin gốc) sinh ra N ImpactEdge (đường lan tác động),
// mỗi edge tự quyết định chiều tác động + độ tin cậy cho riêng đối tượng nó trỏ tới.

export type CatalystCategory =
  | "earnings" | "ma" | "regulatory" | "rating" | "contract" | "insider" | "macro";

export type CatalystCredibility = "confirmed" | "rumor";

export type PropagationDistance =
  | "direct" | "upstream" | "downstream" | "competitor" | "commodity";

export type ImpactDirection = "benefit" | "harm";

export type Horizon = "short" | "medium" | "long"; // ngắn / trung / dài hạn

export type TargetType = "sector" | "ticker";

// Tin tức / sự kiện gốc — chỉ tồn tại 1 lần, không lặp theo từng mã
export interface CatalystSource {
  id: string;
  title: string;
  category: CatalystCategory;
  sourceCredibility: CatalystCredibility;
  publishedDate: Date;       // khi tin thực sự xảy ra / được công bố
  executionDate?: Date | null; // nếu có lịch thực thi cụ thể (luật có hiệu lực, hợp đồng giao hàng...)
                                // Date | null (không phải Date | undefined) để khớp kiểu Prisma trả về
  firstDetectedAt: Date;     // khi hệ thống quét thấy — dùng cho badge "mới"
  corroborationCount: number; // số nguồn độc lập xác nhận
}

// Một đường lan tác động từ 1 CatalystSource đến 1 đối tượng cụ thể (ngành hoặc mã)
export interface ImpactEdge {
  id: string;
  sourceId: string;
  targetType: TargetType;
  targetId: string;          // mã ticker hoặc tên ngành
  direction: ImpactDirection;
  propagationDistance: PropagationDistance;
  hopCount: number;          // 1 = tác động bậc 1, 2 = cascade bậc 2 (Prisma Int không hỗ trợ literal union)
  baseWeight: number;        // 1-10, cường độ gốc trước khi áp suy giảm theo khoảng cách
  decayRate: number;         // tốc độ giảm/ngày (dùng cho pha retrospective/released)
  horizon: Horizon;
}

// Dữ liệu thị trường bên ngoài, do các module khác cung cấp — engine KHÔNG tự tính các giá trị này
export interface MarketSignal {
  ticker: string;
  priceInStatus: "reflected" | "not_reflected";
  volumeFlag: "confirmed" | "suspicious" | "none";
  foreignFlowDirection: "buy" | "sell" | "none";
  foreignFlowValue?: string;   // vd "+2.1M CP", chỉ để hiển thị
  valuationPercentile: number; // 0-1, càng thấp càng "rẻ"/an toàn tương đối trong ngành
  liquidityScore: number;      // 0-1, thanh khoản chuẩn hoá
  isWatchlisted: boolean;
}

// Thống kê hiệu chỉnh lịch sử, tra theo category + propagationDistance
export interface CalibrationEntry {
  category: CatalystCategory;
  propagationDistance: PropagationDistance;
  historicalWinRate: number; // 0-100
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