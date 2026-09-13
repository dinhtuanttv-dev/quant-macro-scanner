import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// SIEU QUET AI - route doc: tra ve Index State + toan bo StockScanItem
// DA QUET SAN tu Database (Cron Job sieu-quet-scan cap nhat dinh ky).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [indexState, items] = await Promise.all([
      prisma.sieuQuetIndexState.findUnique({ where: { id: "singleton" } }),
      prisma.sieuQuetStockItem.findMany(),
    ]);

    // A.1/D.3: CHI sort theo smartScore, day ma bi F-Score thap (<=2/6,
    // tuong duong nguong <=3/9 cua ban goc) xuong cuoi.
    const EXCLUSION_THRESHOLD_RATIO = 3 / 9; // nguong goc Piotroski <=3/9
    const sorted = [...items].sort((a, b) => {
      const aExcluded = a.piotroskiFScore !== null && a.piotroskiFScore <= Math.floor(a.fScoreMax * EXCLUSION_THRESHOLD_RATIO) ? 1 : 0;
      const bExcluded = b.piotroskiFScore !== null && b.piotroskiFScore <= Math.floor(b.fScoreMax * EXCLUSION_THRESHOLD_RATIO) ? 1 : 0;
      if (aExcluded !== bExcluded) return aExcluded - bExcluded;
      return (b.smartScore ?? 0) - (a.smartScore ?? 0);
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      indexState,
      items: sorted,
      totalCount: sorted.length,
    });
  } catch (err) {
    console.error("[api/sieu-quet-ai/scanner] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu Siêu Quét AI lúc này." }, { status: 500 });
  }
}
