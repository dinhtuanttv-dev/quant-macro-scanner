import { NextResponse } from "next/server";
import { buildEarningsSignalForTicker } from "@/lib/cotuc/timing-v3/earnings-signal-io";
import { stockUniverse } from "@/lib/quant-data";

// Tich hop Timing Engine v3 - Giai doan 3 (Earnings Engine): endpoint
// MOI, cho 1 ma cu the - dung cho OptimalTimingTab (khac han
// /api/cotuc/earnings hien co, chuyen xep hang tang truong TOAN THI
// TRUONG cho EarningsQuarterPanel - 2 muc dich khac nhau, KHONG thay
// the nhau).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: "Thiếu tham số ticker." }, { status: 400 });

    const isBank = stockUniverse.find((s) => s.ticker === ticker)?.sector === "Ngan hang";
    const result = await buildEarningsSignalForTicker(ticker, isBank);

    if ("reason" in result) {
      console.error(`[api/cotuc/earnings-signal] ${ticker}: ${result.reason} - ${result.detail}`);
      return NextResponse.json({ error: "Không đủ dữ liệu KQKD cho mã này.", reason: result.reason, detail: result.detail }, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/cotuc/earnings-signal] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Earnings Signal lúc này." }, { status: 500 });
  }
}
