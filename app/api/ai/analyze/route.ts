import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { runMultiAgentAnalysis } from "@/lib/ai/gemini-agents";

export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = createServiceClient();

  // FIX (2026-08-26): ban truoc chi kiem tra !latestMarkets, khong doc
  // truong `error` ma Supabase JS tra ve khi query that bai (thu vien nay
  // KHONG throw, tra { data: null, error: {...} }). Neu co loi that (key
  // sai, RLS chan, ten bang sai...), code cu se hien nham thanh "chua co
  // du lieu" - sai hoan toan nguyen nhan that, gay kho debug (dung tinh
  // than "khong suy doan" - phai lo ro nguyen nhan that).
  const { data: latestMarkets, error: queryError } = await supabase
    .from("world_market_pulse").select("*").order("fetched_at", { ascending: false }).limit(10);

  if (queryError) {
    console.error("[/api/ai/analyze] Loi truy van Supabase:", queryError);
    return NextResponse.json(
      { error: `Lỗi truy vấn Supabase: ${queryError.message}`, code: queryError.code ?? null },
      { status: 502 }
    );
  }

  if (!latestMarkets || latestMarkets.length === 0) {
    return NextResponse.json({ error: "Chưa có dữ liệu thị trường để phân tích (bảng market_pulse rỗng thật)." }, { status: 503 });
  }

  const dataPoints = latestMarkets.map((m: any) => ({
    id: m.id, label: `${m.name} (${m.symbol})`, value: `${m.value} (${m.change_percent}%)`, timestamp: m.fetched_at,
  }));

  try {
    const analysis = await runMultiAgentAnalysis(dataPoints, []);

    await supabase.from("audit_log").insert({
      action: "ai_analyze", data_sources: dataPoints.map((d: any) => d.id),
      model_version: "gemini-3.6-flash", confidence: analysis.finalConfidence,
    });

    return NextResponse.json(analysis);
  } catch (err) {
    // FIX: goi Gemini co the loi (key sai, quota, model name sai...) -
    // ban truoc khong bat, se lam Next.js tra ve 500 chung chung "Internal
    // Server Error" khong co chi tiet gi. Gio tra ve ly do that.
    console.error("[/api/ai/analyze] Loi goi Gemini:", err);
    return NextResponse.json(
      { error: `Lỗi khi gọi Gemini AI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
