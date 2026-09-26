import { NextResponse } from "next/server";
import { buildCycleContext, buildCycleStatsV3 } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// Tich hop Timing Engine v3 - Giai doan 2: endpoint MOI (song song voi
// /api/cotuc/cycle-stats cu, KHONG thay the - route cu van phuc vu
// CycleRankingPanel/CycleTimingPanel hien co, dung % loi nhuan tho).
// Route nay dung CAR market-adjusted that + shrinkage + walk-forward +
// hieu chinh FDR (Benjamini-Hochberg) - nghiem ngat hon nhieu ve mat
// thong ke, cho OptimalTimingTab (v3) moi.
export const dynamic = "force-dynamic";
// FIX (2026-09-26, xac nhan qua do thuc te): maxDuration=30 qua thap -
// MWG da do mat 30.7s (VUOT qua 30s, server TU CAT dung luc gan xong,
// gay 504). Tang len 60s, du du.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Thiếu tham số ticker." }, { status: 400 });

    const ctx = await buildCycleContext(ticker);
    if ("reason" in ctx) {
      console.error(`[api/cotuc/cycle-stats-v3] ${ticker}: ${ctx.reason} - ${ctx.detail}`);
      // FIX (Giai doan 4): doi 422 -> 404 - frontend (fetchCyclePaths/
      // fetchCycleStats trong goi cotuc-timing-engine.zip) coi 404/204
      // la "chua co du lieu" (binh thuong, tra ve null), KHONG PHAI loi.
      return NextResponse.json({ error: "Không đủ dữ liệu giá/lịch sử cổ tức cho mã này.", reason: ctx.reason, detail: ctx.detail }, { status: 404 });
    }

    return NextResponse.json(buildCycleStatsV3(ctx));
  } catch (err) {
    console.error("[api/cotuc/cycle-stats-v3] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Backtest Service (v3) lúc này." }, { status: 500 });
  }
}
