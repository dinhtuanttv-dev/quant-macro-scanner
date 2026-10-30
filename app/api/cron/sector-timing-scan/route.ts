import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/jobs/job-result";
import { runSectorTimingScan } from "@/lib/jobs/sector-timing-scan";

// Lọc ngành (L5) — sổ theo dõi tín hiệu ngành. 30/10/2026 (Vercel CPU giai đoạn 2): lịch chạy chính nằm ở Market Gateway
// (Railway, 16:20 VN ngày giao dịch) — route này chỉ còn là vỏ gọi tay, không còn trong vercel.json.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runSectorTimingScan();
  return NextResponse.json(r.body, { status: r.status });
}
