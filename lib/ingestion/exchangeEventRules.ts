// lib/ingestion/exchangeEventRules.ts — MỘT bộ quy tắc tin tiêu cực của sở giao dịch (dùng chung HOSE + HNX; trước đây mỗi
// nơi một bản sao, lệch nhau). So khớp KHÔNG phân biệt dấu/hoa-thường và chịu được biến thể câu chữ thực tế của sở
// ("bị đưa vào diện BỊ kiểm soát", "diện bị cảnh báo" — bản cũ đòi đúng cụm "diện kiểm soát" nên bỏ sót, rồi sự kiện bị ghi
// trung lập và trước bản sửa X1 bị chấm "có lợi").

export interface ExchangeNegativeRule {
  id: "suspended" | "delisted" | "late-payment" | "controlled" | "warning" | "restricted" | "margin";
  pattern: RegExp;
  severity: "critical" | "high";
  rawImpact: number;
  labelVi: string;
}

/** Bỏ dấu tiếng Việt + đ, chữ thường, gộp khoảng trắng. */
export const foldVi = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ");

// Thứ tự = ưu tiên (nặng trước).
export const EXCHANGE_NEGATIVE_RULES: ExchangeNegativeRule[] = [
  { id: "suspended", pattern: /dinh chi giao dich/, severity: "critical", rawImpact: -9, labelVi: "Dinh chi giao dich" },
  { id: "delisted", pattern: /huy (niem yet|dang ky giao dich|dkgd)/, severity: "critical", rawImpact: -9, labelVi: "Huy niem yet" },
  { id: "late-payment", pattern: /cham thanh toan/, severity: "critical", rawImpact: -8, labelVi: "Cham thanh toan" },
  { id: "controlled", pattern: /kiem soat dac biet|dien (bi )?kiem soat/, severity: "high", rawImpact: -6, labelVi: "Dien kiem soat" },
  { id: "warning", pattern: /canh bao/, severity: "high", rawImpact: -5, labelVi: "Canh bao" },
  { id: "restricted", pattern: /han che giao dich/, severity: "high", rawImpact: -5, labelVi: "Han che giao dich" },
  { id: "margin", pattern: /khong (du dieu kien|duoc) giao dich ky quy/, severity: "high", rawImpact: -3, labelVi: "Mat margin" },
];

export function matchExchangeNegative(text: string): ExchangeNegativeRule | null {
  const t = foldVi(text);
  return EXCHANGE_NEGATIVE_RULES.find((r) => r.pattern.test(t)) ?? null;
}

/** Mã của sở / cơ quan — không phải cổ phiếu (VD "HOSE: Thông báo danh sách…" bị bắt nhầm thành mã HOSE). */
export const NON_STOCK_CODES = new Set(["HOSE", "HSX", "HNX", "UPCOM", "VSD", "VSDC", "SSC", "VNX", "UBCK"]);

export const isStockTicker = (t: string | null | undefined): t is string => !!t && /^[A-Z0-9]{3,5}$/.test(t) && !NON_STOCK_CODES.has(t);
