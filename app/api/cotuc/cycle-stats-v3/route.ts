import { NextResponse } from "next/server";
import { buildCycleContext, buildCycleStatsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// Tich hop Timing Engine v3 - Giai doan 2: endpoint MOI (song song voi
// /api/cotuc/cycle-stats cu, KHONG thay the - route cu van phuc vu
// CycleRankingPanel/CycleTimingPanel hien co, dung % loi nhuan tho).
// Route nay dung CAR market-adjusted that + shrinkage + walk-forward +
// hieu chinh FDR (Benjamini-Hochberg) - nghiem ngat hon nhieu ve mat
// thong ke, cho OptimalTimingTab (v3) moi.
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

    return NextResponse.json(buildCycleStatsV3(ctx));
  } catch (err) {
    console.error("[api/cotuc/cycle-stats-v3] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Backtest Service (v3) lúc này." }, { status: 500 });
  }
}
