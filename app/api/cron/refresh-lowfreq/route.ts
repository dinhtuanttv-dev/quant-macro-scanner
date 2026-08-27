import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { fetchGlobalHousingPrices, fetchLatestRubberPrice } from "@/lib/commodity/lowfreq-fetchers";

export const maxDuration = 60;

// Danh sach quoc gia quan tam - co the mo rong sau. Dung ma ISO chuan BIS
// (da xac nhan qua du lieu that: "US" hoat dong dung).
const WATCHED_COUNTRIES = ["US", "GB", "JP", "CN", "KR", "SG", "AU", "DE", "FR"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, unknown> = {};

  // --- GIA NHA THE GIOI (BIS) - da xac nhan hoat dong 100% ---
  try {
    const housingData = await fetchGlobalHousingPrices(WATCHED_COUNTRIES);
    if (housingData.length > 0) {
      const rows = housingData.map((h) => ({
        country_code: h.countryCode, country_name: h.countryName, quarter_label: h.quarter,
        real_index_value: h.realIndexValue, yoy_change_percent: h.yoyChangePercent,
        source: "BIS (Bank for International Settlements)",
      }));
      const { error } = await supabase.from("world_housing_prices").insert(rows);
      results.housing = error ? { success: false, error: error.message } : { success: true, count: rows.length };
    } else {
      results.housing = { success: false, error: "Không lấy được dữ liệu BIS (0 dòng khớp)" };
    }
  } catch (err) {
    results.housing = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  // --- CAO SU (World Bank) - TAM KHOA: URL nguon dang tra ve du lieu cu
  // (thang 12/2024), da xac nhan qua kiem tra thuc te 2026-08-27. KHONG
  // kich hoat cho toi khi co URL Pink Sheet moi nhat, tranh ghi du lieu
  // cu vao Supabase roi hien thi nhu la "moi nhat" tren UI (sai su that).
  results.rubber = { success: false, skipped: true, reason: "Cho URL World Bank Pink Sheet moi nhat - xem PHASE2-TODO" };

  return NextResponse.json({ generatedAt: new Date().toISOString(), results });
}
