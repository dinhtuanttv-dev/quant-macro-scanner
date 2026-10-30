import { NextRequest, NextResponse } from "next/server";
import { runCatalystScan } from "@/lib/jobs/catalyst-scan";

// Quét Catalyst Engine. 31/10/2026: chạy theo lịch trên Market Gateway (lib/jobs/catalyst-scan.ts); route này chỉ còn là vỏ gọi tay,
// không còn trong vercel.json. Đồ thị và snapshot lưu trên Gateway, không dùng Neon/Upstash.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runCatalystScan();
  return NextResponse.json(r.body, { status: r.status });
}
