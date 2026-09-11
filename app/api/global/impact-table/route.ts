import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";

// NANG CAP (2026-09-11): tu "lay 20 dong gan nhat khong phan biet lan
// chay nao" (co the tron lan nhieu lan bam nut khac nhau) sang "nhom theo
// analysis_run_id, mac dinh tra ve LAN CHAY MOI NHAT, kem danh sach toi
// da 3 lan chay gan nhat de frontend lam bo chon lich su".
//
// Ho tro ?runId=xxx de xem lai 1 trong 3 lan chay gan nhat.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedRunId = searchParams.get("runId");

  const supabase = createServiceClient();

  // Lay toi da 500 dong gan nhat (du bao quat vai chuc nganh x 3 lan chay)
  // de tu do suy ra danh sach 3 run gan nhat + thoi diem + tom tat chung.
  const { data: recentRows, error: recentError } = await supabase
    .from("world_ai_impact_events")
    .select("analysis_run_id, created_at, title")
    .not("analysis_run_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (recentError) {
    return NextResponse.json({ error: `Lỗi Supabase: ${recentError.message}` }, { status: 502 });
  }

  const runsMap = new Map<string, { runId: string; generatedAt: string; overallSummaryVi: string }>();
  for (const row of recentRows ?? []) {
    const rid = row.analysis_run_id as string;
    if (!runsMap.has(rid)) {
      runsMap.set(rid, { runId: rid, generatedAt: row.created_at, overallSummaryVi: row.title });
    }
  }
  // Map giu thu tu insert (JS Map) - recentRows da sort desc theo created_at
  // nen lan dau gap 1 run_id la lan MOI NHAT cua run do.
  const availableRuns = Array.from(runsMap.values()).slice(0, 3);

  const targetRunId = requestedRunId ?? availableRuns[0]?.runId;

  if (!targetRunId) {
    // Chua co lan chay nao (bang rong that, hoac toan bo la du lieu CU
    // truoc nang cap - analysis_run_id NULL). Tra ve rong ro rang, KHONG
    // fallback ve logic cu de tranh tron lan du lieu thieu cau truc moi.
    return NextResponse.json({ runId: null, generatedAt: null, overallSummaryVi: null, sectors: [], availableRuns: [] });
  }

  const { data: sectorRows, error: sectorError } = await supabase
    .from("world_ai_impact_events")
    .select("*")
    .eq("analysis_run_id", targetRunId)
    .order("confidence", { ascending: false });

  if (sectorError) {
    return NextResponse.json({ error: `Lỗi Supabase: ${sectorError.message}` }, { status: 502 });
  }

  return NextResponse.json({
    runId: targetRunId,
    generatedAt: sectorRows?.[0]?.created_at ?? null,
    overallSummaryVi: sectorRows?.[0]?.title ?? null,
    sectors: (sectorRows ?? []).map((r: any) => ({
      id: r.id,
      sectorKey: r.sector_key,
      direction: r.direction,
      confidence: r.confidence,
      impactScore: r.impact_score,
      reasoningVi: r.reasoning_vi,
      evidenceRefs: r.evidence_refs ?? [],
      vnTickers: r.vn_tickers ?? [],
      sourceCategory: r.source_category,
    })),
    availableRuns,
  });
}
