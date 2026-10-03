import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// Quét liên tục (Gateway gọi lô mỗi 3 phút trong phiên) -> cache CDN ngắn để giao diện thấy dữ liệu mới.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };
import { summarizeTracking, type TrackRow } from "@/lib/cotuc/timing-v3/decision/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

// GET /api/cotuc/signal-tracking -> "mô hình có còn hoạt động không": tổng tín hiệu đã phát, tỷ lệ đúng 20 gần nhất,
// Brier score, CUSUM hai phía + 30 bản ghi mới nhất. CHỈ ĐỌC bảng CotucSignalTrack (cron timing-signals-scan ghi).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await prisma.cotucSignalTrack.findMany({ orderBy: { issuedAt: "desc" } });
    const tracks: TrackRow[] = rows.map((r) => ({
      ...r, level: r.level as DecisionLevel, components: (r.components ?? []) as TrackRow["components"], issuedAt: r.issuedAt.toISOString(),
      outcome: r.outcome === null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
    }));
    return NextResponse.json(
      {
        summary: summarizeTracking(tracks),
        recent: tracks.slice(0, 30).map((t) => ({ ...t, components: undefined })),
      },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
