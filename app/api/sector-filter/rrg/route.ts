import { NextResponse } from "next/server";
import { computeRRGPoints } from "@/lib/sector-filter/rrg/compute-rrg";

// FIX RELIABILITY (2026-09-11): logic tinh toan da chuyen sang
// lib/sector-filter/rrg/compute-rrg.ts (dung chung voi top20/route.ts,
// goi TRUC TIEP khong qua HTTP nua). Route nay gio chi la 1 lop wrapper
// mong bien ket qua thanh NextResponse.
export const maxDuration = 30;

export async function GET() {
  try {
    const result = await computeRRGPoints();
    if (!result) {
      return NextResponse.json({ error: "Khong lay du du lieu benchmark VN30 de tinh RRG." }, { status: 502 });
    }
    if (result.errors.length > 0) {
      console.warn("[rrg] Mot so nganh bi bo qua:", result.errors);
    }
    return NextResponse.json({ generatedAt: new Date().toISOString(), benchmark: result.benchmark, points: result.points });
  } catch (err) {
    console.error("[rrg] LOI KHONG XAC DINH:", err);
    return NextResponse.json({ error: "Khong the tinh RRG luc nay.", detail: String(err) }, { status: 500 });
  }
}
