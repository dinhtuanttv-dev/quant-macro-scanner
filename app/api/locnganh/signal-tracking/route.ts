import { NextResponse } from "next/server";
import { cotucErrorCode, storeList } from "@/lib/cotuc/store/gateway-store";
import { toTrack } from "@/lib/locnganh/tracking-store";
import { summarizeSectorTracking, type SectorTrackRow } from "@/lib/locnganh/tracking";

// GET /api/locnganh/signal-tracking — "mô hình ngành có còn hoạt động không": tổng tín hiệu, tỷ lệ đúng 20 gần nhất, Brier, CUSUM
// + 30 bản ghi mới nhất. CHỈ ĐỌC sổ `sectortrack` trong kho Gateway (MV0 — thay Neon). Kho lỗi -> 503 có mã lỗi: trước đây mọi lỗi
// bị nuốt thành "0 tín hiệu", trông như mô hình chưa phát tín hiệu nào trong khi thực ra sổ không đọc được.
export const dynamic = "force-dynamic";

export async function GET() {
  let rows: SectorTrackRow[];
  try {
    rows = (await storeList<Record<string, unknown>>("sectortrack")).map(toTrack).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 2000);
  } catch (e) {
    console.error("[api/locnganh/signal-tracking]", e);
    return NextResponse.json({ error: "Không đọc được sổ theo dõi tín hiệu ngành lúc này.", code: cotucErrorCode(e) }, { status: 503 });
  }
  return NextResponse.json({ summary: summarizeSectorTracking(rows), recent: rows.slice(0, 30) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
