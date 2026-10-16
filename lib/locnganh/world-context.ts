// lib/locnganh/world-context.ts — tín hiệu "Bối cảnh thế giới" cho bộ máy quyết định Lọc ngành (giai đoạn 6 của gói
// macro-center 1.2, tích hợp 2026-10-16).
//
// Nguồn: Gateway GET /api/world/sector-signals — MacroScore của gói trên CHỈ các liên kết bậc A (vượt hiệu chỉnh kiểm định bội BY,
// ổn định ≥ 80% cửa sổ trượt, vượt kiểm định ngoài mẫu walk-forward) của từng rổ ngành, số liệu THẬT (FRED/Yahoo/Gateway).
// Quy tắc an toàn (bất biến của gói): tín hiệu chỉ có trọng số khi `usable` = cổng ngoài mẫu đạt trên số liệu thật; ngược lại trọng
// số 0 -> xác suất tổng hợp GIỐNG HỆT khi không có tín hiệu (có test). Trọng số khởi đầu thấp (WORLD_SIGNAL_WEIGHT) so với xác suất
// lịch sử (n sự kiện) và Confluence (4).
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export const WORLD_SIGNAL_WEIGHT = 2;

/**
 * Ngành ICB của Lọc ngành -> rổ ngành của Kết nối thế giới. Chỉ ánh xạ khi nội dung KHỚP SÁT (ngành rộng như "Thực phẩm & Đồ uống"
 * không đại diện được cho "Thuỷ sản" -> không có tín hiệu thế giới).
 */
export const ICB_TO_WORLD_SECTOR: Record<string, string> = {
  "0500": "S_OIL", "0530": "S_OIL", "0570": "S_OIL",
  "1750": "S_STEEL",
  "2770": "S_PORT",
  "7530": "S_POWER",
  "8300": "S_BANK",
  "8600": "S_RE",
  "8700": "S_SEC",
  "9500": "S_TECH", "9530": "S_TECH",
};

export interface WorldSectorSignal {
  sector: string;
  nameVi: string;
  tierA: string[];
  usable: boolean;
  probability: number | null;
  reason: string;
}

export interface WorldSectorSignalsDoc {
  mode: "real" | "synthetic";
  asOf?: string;
  lastPeriod?: string;
  sectors: WorldSectorSignal[];
  reason?: string;
}

/** Tín hiệu cho một ngành ICB; null = ngành không có ánh xạ (không hiện dòng kiểm tra). Chế độ mô phỏng -> không dùng được. */
export function worldContextFor(code: string, doc: WorldSectorSignalsDoc | null): (WorldSectorSignal & { mapped: string }) | null {
  const mapped = ICB_TO_WORLD_SECTOR[code];
  if (!mapped) return null;
  if (!doc) return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: "Chưa lấy được tín hiệu từ Kết nối thế giới.", mapped };
  if (doc.mode !== "real") return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: "Kết nối thế giới đang dùng dữ liệu mô phỏng — không đưa vào quyết định.", mapped };
  const s = doc.sectors.find((x) => x.sector === mapped);
  if (!s) return { sector: mapped, nameVi: mapped, tierA: [], usable: false, probability: null, reason: doc.reason ?? "Chưa có tín hiệu cho ngành này.", mapped };
  // phòng thủ: chỉ nhận xác suất hữu hạn trong (0,1) khi usable
  const ok = s.usable && typeof s.probability === "number" && s.probability > 0 && s.probability < 1;
  return { ...s, usable: ok, probability: ok ? s.probability : null, mapped };
}

export async function fetchWorldSectorSignals(timeoutMs = 60_000): Promise<WorldSectorSignalsDoc | null> {
  try {
    const res = await fetch(`${MARKET_GATEWAY_URL}/api/world/sector-signals`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as WorldSectorSignalsDoc;
  } catch {
    return null; // Gateway lỗi -> không có tín hiệu thế giới (trọng số 0), quyết định giữ nguyên như trước
  }
}
