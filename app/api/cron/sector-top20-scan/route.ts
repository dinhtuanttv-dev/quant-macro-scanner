import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSectorTop20 } from "@/lib/sector-filter/compute-top20";

// Giai Trinh Hoi Tu - Giai doan 1a: cron dinh ky (1 lan/ngay, gioi han
// Vercel Hobby) tinh Top 20 Loc Nganh RỒI LUU VAO DB - de Confluence
// Engine (pillar "sector") DOC LAI tuc thi thay vi phai tinh realtime
// ~60s moi lan mo 1 ma (khong kha thi).
//
// Ghi de TOAN BO moi lan chay (deleteMany + createMany) - chi giu 1
// snapshot MOI NHAT, khong luu lich su nhieu ngay (chua can thiet).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await computeSectorTop20();

    await prisma.$transaction([
      prisma.sectorTop20Entry.deleteMany({}),
      prisma.sectorTop20Entry.createMany({
        data: result.top20.map((r, idx) => ({
          ticker: r.ticker, sectorKey: r.sectorKey, sectorQuadrant: r.sectorQuadrant,
          rs3m: r.rs3m, confluenceScore: r.confluenceScore, rank: idx + 1,
        })),
      }),
    ]);

    return NextResponse.json({ savedCount: result.top20.length, totalAnalyzed: result.totalAnalyzed, riskOnScore: result.riskOnScore });
  } catch (err) {
    console.error("[cron/sector-top20-scan] Lỗi:", err);
    return NextResponse.json({ error: "Không thể quét Top 20 Lọc Ngành lúc này." }, { status: 500 });
  }
}
