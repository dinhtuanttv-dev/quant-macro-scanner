import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// P2 (Bo Loc toan thi truong) - BUOC 3/4: Frontend doc KET QUA DA QUET
// SAN tu Database (nhanh, KHONG goi VCI/Yahoo truc tiep). Du lieu duoc
// Cron Job 1 (loc su kien) + Cron Job 2 (tinh Quality Score, vong xoay
// 20 ma/ngay) cap nhat dinh ky.
export const dynamic = "force-dynamic";

interface UniverseEntryFull {
  overallScoreTier123: number | null;
}

export async function GET() {
  try {
    const entries = await prisma.dividendUniverseEntry.findMany({
      orderBy: { overallScoreTier123: { sort: "desc", nulls: "last" } },
    });

    const hasScoreCount = entries.filter((e: UniverseEntryFull) => e.overallScoreTier123 !== null).length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalCount: entries.length,
      hasScoreCount, // so ma DA tinh xong Quality Score (con lai dang cho toi luot trong vong xoay)
      entries,
    });
  } catch (err) {
    console.error("[api/cotuc/universe-scores] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu universe lúc này." }, { status: 500 });
  }
}
