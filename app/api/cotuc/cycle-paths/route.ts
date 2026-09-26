import { NextResponse } from "next/server";
import { buildCycleContext, buildCyclePathsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// Tich hop Timing Engine v3 - Giai doan 2: endpoint MOI (chua ton tai
// truoc do), tra ve duong CAR (market-adjusted) theo tung dot lich su +
// dot hien tai, dung cho CycleTimeline.tsx ve bieu do.
export const dynamic = "force-dynamic";
// FIX (2026-09-26, xac nhan qua do thuc te): maxDuration=30 qua thap -
// MWG da do mat 30.7s (VUOT qua 30s, server TU CAT dung luc gan xong,
// gay 504). Tang len 60s, du du.
export const maxDuration = 60;

export async function GET(req: Request) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Thiếu tham số ticker." }, { status: 400 });

    console.error(`[cycle-paths] ${ticker} BAT DAU`);
    const ctx = await buildCycleContext(ticker);
    console.error(`[cycle-paths] ${ticker} buildCycleContext XONG (${Date.now() - t0}ms)`);
    if ("reason" in ctx) {
      // FIX (2026-09-26): tra ve ly do cu the thay vi "khong du du
      // lieu" chung chung, de debug duoc chinh xac buoc nao that bai.
      console.error(`[api/cotuc/cycle-paths] ${ticker}: ${ctx.reason} - ${ctx.detail}`);
      // FIX (Giai doan 4): doi 422 -> 404 - frontend (fetchCyclePaths/
      // fetchCycleStats trong goi cotuc-timing-engine.zip) coi 404/204
      // la "chua co du lieu" (binh thuong, tra ve null), KHONG PHAI loi.
      return NextResponse.json({ error: "Không đủ dữ liệu giá/lịch sử cổ tức cho mã này.", reason: ctx.reason, detail: ctx.detail }, { status: 404 });
    }

    const result = buildCyclePathsV3(ctx);
    console.error(`[cycle-paths] ${ticker} buildCyclePathsV3 XONG (${Date.now() - t0}ms) - HOAN TAT`);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[api/cotuc/cycle-paths] Lỗi sau ${Date.now() - t0}ms:`, err);
    return NextResponse.json({ error: "Không thể tính đường CAR lúc này." }, { status: 500 });
  }
}
