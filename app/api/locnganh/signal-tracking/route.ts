import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeSectorTracking, type SectorTrackRow } from "@/lib/locnganh/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

// GET /api/locnganh/signal-tracking — "mô hình ngành có còn hoạt động không": tổng tín hiệu, tỷ lệ đúng 20 gần nhất, Brier, CUSUM
// + 30 bản ghi mới nhất. CHỈ ĐỌC bảng SectorSignalTrack (cron sector-timing-scan ghi). Chưa có bảng -> sổ rỗng.
export const dynamic = "force-dynamic";

export async function GET() {
  let rows: SectorTrackRow[] = [];
  try {
    rows = (await prisma.sectorSignalTrack.findMany({ orderBy: { issuedAt: "desc" } })).map((r) => ({
      ...r, level: r.level as DecisionLevel, components: (r.components ?? []) as SectorTrackRow["components"], issuedAt: r.issuedAt.toISOString(),
      outcome: r.outcome === null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
    }));
  } catch { /* bảng chưa được cron tạo */ }
  return NextResponse.json({ summary: summarizeSectorTracking(rows), recent: rows.slice(0, 30) }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
}
