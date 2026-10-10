import { NextResponse } from "next/server";
import { getSectorTiming } from "@/lib/locnganh/sector-timing-service";

// Lọc ngành (L2) — tín hiệu thời điểm cho CẢ vũ trụ ngành ICB trong MỘT request (SectorTimingSignalsBulkV3 + trường mở rộng).
// Nguồn: Market Gateway (RRG tuần JdK, chỉ số ngành) + engine lib/locnganh (event-study, Beta-Binomial, hợp nhất, quyết định).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { details: _details, ...bulk } = await getSectorTiming();
    void _details;
    return NextResponse.json(bulk, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
  } catch (err) {
    console.error("[locnganh/sector-timing-signals]", err);
    return NextResponse.json({ error: "Không tính được tín hiệu ngành lúc này.", detail: String(err) }, { status: 502 });
  }
}
