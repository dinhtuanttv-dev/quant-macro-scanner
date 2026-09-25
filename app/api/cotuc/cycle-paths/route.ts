import { NextResponse } from "next/server";
import { buildCycleContext, buildCyclePathsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// Tich hop Timing Engine v3 - Giai doan 2: endpoint MOI (chua ton tai
// truoc do), tra ve duong CAR (market-adjusted) theo tung dot lich su +
// dot hien tai, dung cho CycleTimeline.tsx ve bieu do.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Thiếu tham số ticker." }, { status: 400 });

    const ctx = await buildCycleContext(ticker);
    if (!ctx) {
      return NextResponse.json({ error: "Không đủ dữ liệu giá/lịch sử cổ tức cho mã này." }, { status: 422 });
    }

    return NextResponse.json(buildCyclePathsV3(ctx));
  } catch (err) {
    console.error("[api/cotuc/cycle-paths] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính đường CAR lúc này." }, { status: 500 });
  }
}
