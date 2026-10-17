import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readThroughByVersion } from "@/lib/cotuc/data-version";
// Gateway quét theo đợt (N1) + đọc qua KV theo phiên bản dữ liệu (N2) -> CDN 5 phút.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" };
import { summarizeTracking, type TrackRow } from "@/lib/cotuc/timing-v3/decision/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

// GET /api/cotuc/signal-tracking -> "mô hình có còn hoạt động không": tổng tín hiệu đã phát, tỷ lệ đúng 20 gần nhất,
// Brier score, CUSUM hai phía + 30 bản ghi mới nhất. CHỈ ĐỌC bảng CotucSignalTrack (cron timing-signals-scan ghi).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await readThroughByVersion("signal-tracking", async () => {
      const rows = await prisma.cotucSignalTrack.findMany({ orderBy: { issuedAt: "desc" } });
      const tracks: TrackRow[] = rows.map((r) => ({
        ...r, level: r.level as DecisionLevel, components: (r.components ?? []) as TrackRow["components"], issuedAt: r.issuedAt.toISOString(),
        outcome: r.outcome === null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
      }));
      // JSON.parse(JSON.stringify): bỏ các khoá undefined giống hệt khi NextResponse.json tuần tự hoá -> bản đệm và bản tính trực tiếp như nhau.
      return JSON.parse(JSON.stringify({ summary: summarizeTracking(tracks), recent: tracks.slice(0, 30).map((t) => ({ ...t, components: undefined })) }));
    });
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (e) {
    console.error("[api/cotuc/signal-tracking] Lỗi:", e);
    return NextResponse.json({ error: "Không tải được theo dõi tín hiệu lúc này." }, { status: 500 });
  }
}
