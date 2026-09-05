import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("world_macro_trends")
    .select("dxy,vix,treasury_10y,gold,fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return NextResponse.json({ error: "Khong lay duoc lich su macro." }, { status: 502 });
  }

  const chronological = [...data].reverse();

  return NextResponse.json({
    dxy: chronological.map((r) => r.dxy),
    vix: chronological.map((r) => r.vix),
    treasury10y: chronological.map((r) => r.treasury_10y),
    gold: chronological.map((r) => r.gold),
    points: chronological.length,
  });
}
