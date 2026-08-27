import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

// Du lieu quy/thang - khong can real-time, dung GET thuong (Project B se
// cache qua SWR voi refreshInterval dai, khong qua SSE).
export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("world_housing_prices")
    .select("*")
    .order("fetched_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: `Lỗi Supabase: ${error.message}` }, { status: 502 });
  }

  // Bang da duoc thiet ke chi giu 1 dong/quoc gia (fix bug hom truoc), nen
  // khong can loc them o day - nhung van group phong khi co ban ghi cu con sot.
  const latestPerCountry = new Map<string, typeof data[number]>();
  for (const row of data ?? []) {
    if (!latestPerCountry.has(row.country_code)) latestPerCountry.set(row.country_code, row);
  }

  return NextResponse.json({ countries: Array.from(latestPerCountry.values()) });
}
