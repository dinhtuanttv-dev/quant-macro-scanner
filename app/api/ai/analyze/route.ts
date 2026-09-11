import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { runMultiAgentAnalysis } from "@/lib/ai/gemini-agents";
import { fetchMacroNews } from "@/lib/news/macro-rss";

// FIX (2026-08-29): tang tu 30 len 60 - them News Agent (fetch RSS + Gemini
// them 1 lan goi) khien tong thoi gian co the vuot 30s, dac biet lan dau
// sau khi khoi dong lai (Turbopack bien dich lan dau).
export const maxDuration = 60;

// NANG CAP (2026-09-11): giu lich su toi da 3 LAN CHAY gan nhat (khong
// phai 3 NGAY) - moi lan bam "Chay Phan Tich AI" la 1 run, danh dau bang
// analysis_run_id (UUID). Sau khi ghi run moi, xoa cac run cu hon 3 lan
// gan nhat de bang khong phinh to vo han qua thoi gian.
const MAX_RETAINED_RUNS = 3;

export async function POST(request: Request) {
  const supabase = createServiceClient();

  // MUC 4 (2026-08-27): cache 45 phut (giua khoang 30-60 da xac nhan) -
  // tranh goi Gemini TON PHI THAT moi lan bam nut. Kiem tra cache TRUOC
  // khi lam bat cu viec gi khac (kie ca doc world_market_pulse).
  const CACHE_MAX_AGE_MINUTES = 45;
  const { data: cached } = await supabase
    .from("ai_analysis_cache").select("result, generated_at").eq("id", "latest").maybeSingle();

  if (cached) {
    const ageMinutes = (Date.now() - new Date(cached.generated_at).getTime()) / 60000;
    if (ageMinutes < CACHE_MAX_AGE_MINUTES) {
      return NextResponse.json({ ...cached.result, cached: true, cacheAgeMinutes: Math.round(ageMinutes) });
    }
  }

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
    const news = await fetchMacroNews();
    const analysis = await runMultiAgentAnalysis(dataPoints, news);

    // NANG CAP: 1 UUID danh dau toan bo cac ban ghi thuoc CUNG 1 lan chay
    // nay - de frontend co the tach lich su theo tung lan bam nut, thay
    // vi tron lan nhu truoc day (route impact-table cu chi lay 20 dong
    // gan nhat khong phan biet lan chay nao).
    const runId = crypto.randomUUID();

    await supabase.from("audit_log").insert({
      action: "ai_analyze", data_sources: dataPoints.map((d: any) => d.id),
      model_version: "gemini-3.6-flash", confidence: analysis.sectors.length > 0
        ? analysis.sectors.reduce((s, x) => s + x.confidence, 0) / analysis.sectors.length
        : 0,
    });

    // NANG CAP: gio ghi 1 dong / nganh VOI direction/confidence/reasoning
    // RIENG (truoc day ca N dong deu copy y het 1 ket luan chung).
    let impactEventsWritten = 0;
    let impactEventsError: string | null = null;
    if (analysis.sectors.length > 0) {
      const { lookupSectorMapping } = await import("@/lib/mapping/macro-mapping");
      const events = analysis.sectors
        .map((sector) => {
          const mapping = lookupSectorMapping(sector.sectorKey);
          if (!mapping) return null; // Bo qua sector key khong xac dinh, khong bia mapping rong
          return {
            analysis_run_id: runId,
            title: analysis.overallSummaryVi, // MOI: dung 1 tieu de chung, frontend chi hien 1 lan o dau bang
            source_category: "market_index",
            sector_key: sector.sectorKey,
            direction: sector.direction, // MOI: "bullish"|"bearish"|"neutral", RIENG cho nganh nay
            impact_score: Math.round(sector.confidence * 100),
            confidence: sector.confidence,
            reasoning_vi: sector.reasoningVi, // MOI
            evidence_refs: sector.evidenceRefs, // MOI
            horizon: "short_term",
            vn_tickers: mapping.vnTickers,
            sources: [],
            ai_model: "gemini-3.6-flash",
          };
        })
        .filter((e): e is Exclude<typeof e, null> => e !== null);

      if (events.length > 0) {
        const { error: impactError, data: insertedRows } = await supabase.from("world_ai_impact_events").insert(events).select("id");
        if (impactError) {
          console.error("[/api/ai/analyze] Loi ghi world_impact_events:", impactError);
          impactEventsError = impactError.message;
        } else {
          impactEventsWritten = insertedRows?.length ?? 0;

          // Don rac: giu lai dung MAX_RETAINED_RUNS lan chay gan nhat.
          // Tim cac run_id CU HON top-N, xoa het cac dong thuoc run do.
          const { data: distinctRuns } = await supabase
            .from("world_ai_impact_events")
            .select("analysis_run_id, created_at")
            .not("analysis_run_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(500); // du lon de bao quat vai chuc run x vai nganh/run

          if (distinctRuns) {
            const seen = new Set<string>();
            const runIdsOrdered: string[] = [];
            for (const row of distinctRuns) {
              const rid = row.analysis_run_id as string;
              if (!seen.has(rid)) { seen.add(rid); runIdsOrdered.push(rid); }
            }
            const runIdsToDelete = runIdsOrdered.slice(MAX_RETAINED_RUNS);
            if (runIdsToDelete.length > 0) {
              const { error: deleteError } = await supabase
                .from("world_ai_impact_events").delete().in("analysis_run_id", runIdsToDelete);
              if (deleteError) {
                // Khong lam that bai request chinh vi loi don rac - chi log
                console.error("[/api/ai/analyze] Loi don rac run cu:", deleteError);
              }
            }
          }
        }
      }
    }

    const responsePayload = { ...analysis, runId, impactEventsWritten, impactEventsError };

    await supabase.from("ai_analysis_cache").upsert({ id: "latest", result: responsePayload, generated_at: new Date().toISOString() });

    return NextResponse.json({ ...responsePayload, cached: false });
  } catch (err) {
    console.error("[/api/ai/analyze] Loi goi Gemini:", err);
    return NextResponse.json(
      { error: `Lỗi khi gọi Gemini AI: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
