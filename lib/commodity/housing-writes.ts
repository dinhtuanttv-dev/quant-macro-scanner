// Kế hoạch ghi bảng world_housing_prices cho cron refresh-lowfreq (21/11/2026).
// Trước đây cron `insert` mọi lần chạy -> trùng dòng mỗi tuần, hoặc lỗi nếu bảng có ràng buộc 1 dòng/quốc gia.
// Nay: chỉ ghi khi BIS có QUÝ MỚI; quốc gia đã có dòng thì cập nhật theo country_code, chưa có thì thêm.
// Không xoá dữ liệu, không phụ thuộc ràng buộc của bảng (repo không có migration của bảng này).
import type { HousingPriceIndexPoint } from "./lowfreq-fetchers";

export interface StoredHousingRow { country_code: string; quarter_label: string | null }
export interface HousingRow {
  country_code: string; country_name: string; quarter_label: string;
  real_index_value: number; yoy_change_percent: number | null; source: string;
}

const SOURCE = "BIS (Bank for International Settlements)";
/** "2026-Q2" -> 20262 để so thứ tự; nhãn lạ -> -1 (coi như cũ nhất). */
export const quarterRank = (q: string | null | undefined): number => {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(q ?? ""));
  return m ? Number(m[1]) * 10 + Number(m[2]) : -1;
};

export function planHousingWrites(stored: StoredHousingRow[], incoming: HousingPriceIndexPoint[]) {
  // Quý mới nhất đang lưu cho từng quốc gia (bảng có thể còn vài dòng cũ).
  const latest = new Map<string, number>();
  for (const r of stored) latest.set(r.country_code, Math.max(latest.get(r.country_code) ?? -1, quarterRank(r.quarter_label)));
  const updates: HousingRow[] = [], inserts: HousingRow[] = [];
  let unchanged = 0;
  for (const h of incoming) {
    const row: HousingRow = {
      country_code: h.countryCode, country_name: h.countryName, quarter_label: h.quarter,
      real_index_value: h.realIndexValue, yoy_change_percent: h.yoyChangePercent, source: SOURCE,
    };
    if (!latest.has(h.countryCode)) inserts.push(row);
    else if (quarterRank(h.quarter) > (latest.get(h.countryCode) ?? -1)) updates.push(row);
    else unchanged++;
  }
  return { updates, inserts, unchanged };
}
