import { NextResponse } from "next/server";
import { computeSectorTop20 } from "@/lib/sector-filter/compute-top20";

// FIX RELIABILITY (2026-09-11): 10s qua thap - route nay xu ly 61+ ma qua
// Yahoo Finance, truoc day CON tu goi HTTP sang route /rrg (da loai bo,
// xem lib/sector-filter/rrg/compute-rrg.ts). Tang len 60s giong cac route
// xu ly nang khac trong du an.
//
// GIAI DOAN 1a (Giai Trinh Hoi Tu): logic tinh toan da TACH sang
// lib/sector-filter/compute-top20.ts (dung CHUNG voi cron
// /api/cron/sector-top20-scan) - route nay GIU NGUYEN hanh vi cu 100%
// (tra ve realtime khi nguoi dung goi truc tiep tu Tab Loc Nganh).
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filterSectorKey = searchParams.get("sectorKey");
  const result = await computeSectorTop20(filterSectorKey);
  return NextResponse.json(result);
}
