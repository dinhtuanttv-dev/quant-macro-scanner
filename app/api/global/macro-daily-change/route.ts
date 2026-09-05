import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

// Tra ve gia macro moi nhat KEM % thay doi so voi ban ghi gan nhat
// cach day ~24h (khong phai so voi lan fetch SSE truoc do vai giay).
// Day la chuan tinh % thay doi dung nganh tai chinh cho cac chi so vi mo.
export async function GET() {
  const supabase = createServiceClient();

  const { data: latest, error: latestErr } = await supabase
    .from("world_macro_trends")
    .select("*")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .single();

  if (latestErr || !latest) {
    return NextResponse.json({ error: "Khong lay duoc du lieu macro moi nhat." }, { status: 502 });
  }

  const latestTime = new Date(latest.fetched_at).getTime();
  const twentyFourHoursAgo = new Date(latestTime - 24 * 60 * 60 * 1000).toISOString();

  const { data: baseline } = await supabase
    .from("world_macro_trends")
    .select("*")
    .lte("fetched_at", twentyFourHoursAgo)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  function pctChange(current: number | null, prev: number | null | undefined): number | null {
    if (current === null || prev === null || prev === undefined || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  }

  return NextResponse.json({
    fetchedAt: latest.fetched_at,
    baselineFetchedAt: baseline?.fetched_at ?? null,
    dxy: { value: latest.dxy, changePct: pctChange(latest.dxy, baseline?.dxy) },
    vix: { value: latest.vix, changePct: pctChange(latest.vix, baseline?.vix) },
    treasury10y: { value: latest.treasury_10y, changePct: pctChange(latest.treasury_10y, baseline?.treasury_10y) },
    gold: { value: latest.gold, changePct: pctChange(latest.gold, baseline?.gold) },
    riskStatus: latest.risk_status,
    riskOnScore: latest.risk_on_score,
  });
}
