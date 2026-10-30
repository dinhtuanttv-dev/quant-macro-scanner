import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/jobs/job-result";
import { runEarningsSeasonalityScan, type SeasonalityPhase } from "@/lib/jobs/earnings-seasonality-scan";

// Mùa vụ KQKD theo quý (?phase=collect&offset&limit | ?phase=finalize | không tham số = collect toàn bộ rồi finalize).
// 30/10/2026 (Vercel CPU giai đoạn 2): lịch chạy chính nằm ở Market Gateway (Railway) — route này chỉ còn là vỏ gọi tay.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const p = searchParams.get("phase");
  const phase: SeasonalityPhase = p === "collect" || p === "finalize" ? p : null;
  const r = await runEarningsSeasonalityScan({ phase, offset: Number(searchParams.get("offset") ?? "0"), limit: Number(searchParams.get("limit") ?? "3") });
  return NextResponse.json(r.body, { status: r.status });
}
