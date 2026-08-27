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

    // MOI (Bang tong hop tac dong co phieu): ghi vao world_impact_events -
    // bang nay da co san trong schema tu Buoc 4 nhung chua route nao dung.
    // Kiem tra loi insert ro rang, khong im lang nuot loi (dung thoi quen
    // da thiet lap sau bug market_pulse/macro_trends truoc do).
    let impactEventsWritten = 0;
    let impactEventsError: string | null = null;
    if (analysis.market?.affectedSectorKeys?.length > 0) {
      const { lookupSectorMapping } = await import("@/lib/mapping/macro-mapping");
      const events = analysis.market.affectedSectorKeys
        .map((key: string) => {
          const mapping = lookupSectorMapping(key);
          if (!mapping) return null; // Bo qua sector key khong xac dinh, khong bia mapping rong
          return {
            title: analysis.market.summaryVi,
            sector_key: key,
            direction: analysis.market.direction,
            impact_score: Math.round(analysis.finalConfidence * 100),
            confidence: analysis.finalConfidence,
            horizon: "short_term",
            vn_tickers: mapping.vnTickers,
            sources: [],
            ai_model: "gemini-3.6-flash",
          };
        })
        .filter((e: unknown): e is NonNullable<typeof e> => e !== null);

      if (events.length > 0) {
        const { error: impactError, data: insertedRows } = await supabase.from("world_impact_events").insert(events).select("id");
        if (impactError) {
          console.error("[/api/ai/analyze] Loi ghi world_impact_events:", impactError);
          impactEventsError = impactError.message;
        } else {
          impactEventsWritten = insertedRows?.length ?? 0;
        }
      }
    }

    return NextResponse.json({ ...analysis, impactEventsWritten, impactEventsError });
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
