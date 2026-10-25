import { NextResponse } from "next/server";
import { storeList, storeUpsert } from "@/lib/cotuc/store/gateway-store";
import { toTrack } from "@/lib/locnganh/tracking-store";
import { getSectorTiming } from "@/lib/locnganh/sector-timing-service";
import { planSectorIssue, planSectorResolutions } from "@/lib/locnganh/tracking";

// Lọc ngành (L5) — cron hằng ngày sau job ngành của Gateway (15:50): tính lại tín hiệu ngành, GHI sổ theo dõi khi ngành vào vùng
// mua với quyết định FAVORABLE/WATCH, chấm kết quả các bản ghi đã tới ngày thoát (CAR chỉ số ngành − VN-Index).
// MV0 (25/10/2026): sổ theo dõi lưu ở KHO trên Market Gateway (bảng `sectortrack`, Railway Volume) thay Neon (hết hạn mức 53000 —
// trước đây mọi lượt ghi đều lỗi). Lịch sử cũ trong Neon nhập lại bằng scripts/migrate-cotuc-neon-to-gateway.ts khi Neon mở lại.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const t = await getSectorTiming(true);
    const rows = (await storeList<Record<string, unknown>>("sectortrack")).map((r) => toTrack(r));
    const now = new Date().toISOString(), benchDates = t.bench.map((b) => b.date);
    let issued = 0;
    for (const sig of t.signals) {
      const row = planSectorIssue(sig, t.details.get(sig.sectorKey)?.stats.selectedWindowId ?? null, rows, benchDates, t.asOf, now);
      if (!row) continue;
      await storeUpsert("sectortrack", [{ ...row, outcomeRecordedAt: null }]);
      rows.push(row); issued++;
    }
    const resolutions = planSectorResolutions(rows.filter((r) => r.outcome === null), (c) => t.indexPrices.get(c), t.bench);
    if (resolutions.length) {
      const at = new Date().toISOString();
      await storeUpsert("sectortrack", resolutions.map((r) => ({ id: r.id, outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: at })));
    }
    return NextResponse.json({ ok: true, asOf: t.asOf, sectors: t.signals.length, issued, resolved: resolutions.length, total: rows.length,
      actions: t.signals.reduce<Record<string, number>>((m, s) => ({ ...m, [s.action]: (m[s.action] ?? 0) + 1 }), {}) });
  } catch (err) {
    console.error("[cron/sector-timing-scan]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
