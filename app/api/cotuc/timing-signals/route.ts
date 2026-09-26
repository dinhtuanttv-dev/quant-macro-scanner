import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Tich hop Sprint 4-5 (Screener 4 cot moi): endpoint tra TimingSignal
// cho CA vu tru trong MOT request (khong nhan tham so ticker).
//
// FIX QUAN TRONG (2026-09-26, xac nhan qua kiem tra thuc te): ban dau
// route nay TU TINH REAL-TIME (goi Yahoo/VNDirect + computeCyclePaths/
// computeCycleStats cho tung ma ngay trong request) - da bi
// FUNCTION_INVOCATION_TIMEOUT that su tren Vercel Hobby plan, DU DA:
//  1. Giam tu 57 xuong 17-18 ma (DIVIDEND_STOCKS thay vi toan bo
//     stockUniverse) - VAN timeout.
//  2. Tang maxDuration tu 60 len 300 (toi da Hobby plan theo tai lieu
//     Vercel) - VAN timeout.
// => Xac nhan gioi han that CUA TAI KHOAN NAY thap hon ca 2 muc thu.
//
// GIAI PHAP BEN VUNG: doi sang mo hinh CRON tinh truoc + luu DB (giong
// dung pattern SectorTop20Entry da lam cho Elite 10) - route nay GIO
// CHI DOC LAI bang TimingSignalCache (da duoc /api/cron/timing-signals-
// scan tinh va luu dinh ky), khong tinh gi ca luc nay nen KHONG BAO
// GIO timeout.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.timingSignalCache.findMany();

    const signals = rows.map((r) => ({
      ticker: r.ticker,
      action: r.action,
      tdToEx: r.tdToEx,
      window: r.windowEntryFrom !== null && r.windowEntryTo !== null && r.windowExitOffset !== null
        ? { entryFrom: r.windowEntryFrom, entryTo: r.windowEntryTo, exitOffset: r.windowExitOffset }
        : null,
      expectedNetReturn: r.expectedNetReturn,
      nEvents: r.nEvents,
      fdrQValue: r.fdrQValue,
      confidence: r.confidence,
      dateStatus: null,
      earnings: null,
    }));

    const asOf = rows.length > 0
      ? rows.reduce((max, r) => (r.generatedAt > max ? r.generatedAt : max), rows[0].generatedAt).toISOString()
      : new Date().toISOString();

    return NextResponse.json({ version: "v3-p5", asOf, signals });
  } catch (err) {
    console.error("[api/cotuc/timing-signals] Lỗi:", err);
    return NextResponse.json({ error: "Không đọc được Timing Signals." }, { status: 500 });
  }
}
