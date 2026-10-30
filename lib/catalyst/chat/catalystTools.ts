// Kiểu kết quả công cụ chat. 31/10/2026: gỡ 3 công cụ catalyst_* (engine Chất xúc tác dừng từ 10/10, tab đã gỡ).
export interface ChatToolResult {
  ok: boolean;
  notice?: string | null;
  data?: unknown;
  guidance?: string[];
  error?: string;
}
