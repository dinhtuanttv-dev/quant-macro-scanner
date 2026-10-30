import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/jobs/job-result";
import { runTimingSignalsScan } from "@/lib/jobs/timing-signals-scan";

// Quyết định 3 trạng thái + theo dõi tín hiệu cổ tức. 30/10/2026 (Vercel CPU giai đoạn 2): lịch chạy chính nằm ở Market Gateway
// (Railway, gọi runTimingSignalsScan trong tiến trình) — route này chỉ còn là vỏ gọi tay, không còn trong vercel.json.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const r = await runTimingSignalsScan({ offset: Number(searchParams.get("offset") ?? "0"), limit: Number(searchParams.get("limit") ?? "25") });
  return NextResponse.json(r.body, { status: r.status });
}
