import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

export async function GET() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("world_ai_impact_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: `Lỗi Supabase: ${error.message}` }, { status: 502 });
  }

  return NextResponse.json({ events: data ?? [] });
}
