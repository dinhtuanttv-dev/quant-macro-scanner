import { NextResponse } from "next/server";
import { storeList, withDates } from "@/lib/cotuc/store/gateway-store";
import { CACHE_HEADERS } from "@/lib/cotuc/timing-v3/seasonality/seasonality-read";

// GET /api/cotuc/earnings-signals -> EarningsSignal của CẢ danh mục trong một lần gọi (cho mục "Sắp KQKD" của
// Lịch Sự Kiện v3) — đọc bảng EarningsSeasonalityCache do cron earnings-seasonality-scan ghi (CafeF + VCI).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // B2: kho Cổ tức trên Gateway (thay Neon).
    const rows = (await storeList<{ ticker: string; earningsSignal: unknown; collectedAt: string }>("season", { fields: ["ticker", "earningsSignal", "collectedAt"] }))
      .map((r) => withDates(r, ["collectedAt"] as const));
    const signals = rows.filter((r) => r.earningsSignal).map((r) => r.earningsSignal);
    const generatedAt = rows.reduce<Date | null>((m, r) => (r.collectedAt && (!m || r.collectedAt > m) ? r.collectedAt : m), null);
    return NextResponse.json({ generatedAt: generatedAt?.toISOString() ?? null, count: signals.length, signals }, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
