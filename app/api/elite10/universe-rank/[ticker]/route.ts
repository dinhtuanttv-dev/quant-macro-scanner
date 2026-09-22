import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Elite 10 - Viec 5 (ra soat 2026-09-17): tan dung Top 200 Universe (da
// co du lieu THAT tu TradingView Scanner, da doi chieu VIC/VHM khop
// Yahoo/VNDirect) lam nguon BO SUNG cho Pattern Scanner Panel.
//
// QUAN TRONG: KHONG map Score (=0.4*norm(MarketCap)+0.6*norm(Volume30D))
// thanh "geometricMatchPct" - 2 khai niem HOAN TOAN KHAC NHAU (thanh
// khoan/von hoa vs do khop mau hinh gia). Tra ve rieng "universeRank"
// nhu 1 TRUONG BO SUNG, KHONG THAY THE phan pattern hinh hoc (van mock,
// giu nguyen minh bach qua MockDataBanner).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  try {
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam.toUpperCase();

    const [entry, totalCount] = await Promise.all([
      prisma.sieuQuetUniverseTicker.findUnique({ where: { ticker } }),
      prisma.sieuQuetUniverseTicker.count(),
    ]);

    return NextResponse.json({
      ticker,
      inTop200: entry !== null,
      rank: entry?.rank ?? null,
      score: entry?.score ?? null,
      totalUniverseSize: totalCount,
      note: "Xếp hạng theo thanh khoản + vốn hóa (TradingView Scanner), KHÔNG PHẢI độ khớp mẫu hình kỹ thuật.",
    });
  } catch (err) {
    console.error("[api/elite10/universe-rank] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tra cứu xếp hạng lúc này." }, { status: 500 });
  }
}
