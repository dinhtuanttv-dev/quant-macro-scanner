import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { fetchGlobalHousingPrices, fetchLatestRubberPrice, fetchLatestFertilizerPrices } from "@/lib/commodity/lowfreq-fetchers";

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

  // --- CAO SU + PHAN BON (World Bank Pink Sheet) ---
  // FIX (2026-09-10): kich hoat lai - nguyen nhan tam khoa truoc day (URL
  // het han) da duoc sua trong lowfreq-fetchers.ts bang co che phat hien
  // URL dong. Ghi vao bang moi "monthly_commodity_price" (xem migration
  // add_monthly_commodity_price.sql) - CHUA co bang nay trong Supabase,
  // PHAI chay migration truoc khi cron nay chay lan dau, neu khong insert
  // se that bai voi loi ro rang (khong phai loi am tham).
  try {
    const rubberPoints = await fetchLatestRubberPrice(6);
    if (rubberPoints && rubberPoints.length > 0) {
      const rows = rubberPoints.map((p) => ({
        commodity_key: "RUBBER_RSS3", period: p.month, price: p.priceUsdKg, unit: "USD/kg",
        source: "World Bank Pink Sheet",
      }));
      // upsert theo (commodity_key, period) - trach nhiem UNIQUE constraint
      // trong migration, tranh insert trung khi cron chay lai nhieu lan/thang
      const { error } = await supabase.from("monthly_commodity_price").upsert(rows, { onConflict: "commodity_key,period" });
      results.rubber = error ? { success: false, error: error.message } : { success: true, count: rows.length, latestPeriod: rubberPoints[rubberPoints.length - 1].month };
    } else {
      results.rubber = { success: false, error: "Không lấy được dữ liệu Cao su (World Bank) - xem log server để biết cột/sheet thực tế" };
    }
  } catch (err) {
    results.rubber = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const fertilizerPoints = await fetchLatestFertilizerPrices(6);
    if (fertilizerPoints && fertilizerPoints.length > 0) {
      const rows: { commodity_key: string; period: string; price: number; unit: string; source: string }[] = [];
      for (const p of fertilizerPoints) {
        if (p.ureaUsdMt !== null) rows.push({ commodity_key: "UREA", period: p.month, price: p.ureaUsdMt, unit: "USD/mt", source: "World Bank Pink Sheet" });
        if (p.dapUsdMt !== null) rows.push({ commodity_key: "DAP", period: p.month, price: p.dapUsdMt, unit: "USD/mt", source: "World Bank Pink Sheet" });
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("monthly_commodity_price").upsert(rows, { onConflict: "commodity_key,period" });
        results.fertilizer = error ? { success: false, error: error.message } : { success: true, count: rows.length };
      } else {
        results.fertilizer = { success: false, error: "Có dữ liệu kỳ nhưng cả Urea và DAP đều null" };
      }
    } else {
      results.fertilizer = { success: false, error: "Không lấy được dữ liệu Phân bón (World Bank) - xem log server để biết cột/sheet thực tế" };
    }
  } catch (err) {
    results.fertilizer = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ generatedAt: new Date().toISOString(), results });
}
