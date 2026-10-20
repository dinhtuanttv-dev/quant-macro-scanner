// D3 (2026-10-20) — trạng thái đệm truy vấn Neon (theo instance) và vô hiệu hoá toàn bộ khi sửa Neon từ ngoài ứng dụng.
//   GET  /api/ops/read-cache            thống kê instance hiện tại (trúng L1/L2, đọc Neon, lệnh KV)
//   POST /api/ops/read-cache  (Bearer CRON_SECRET)  vô hiệu hoá toàn bộ đệm
import { NextResponse } from "next/server";
import { queryCache } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ instance: queryCache.instance, stats: queryCache.stats() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await queryCache.invalidateAll();
  return NextResponse.json({ ok: true });
}
