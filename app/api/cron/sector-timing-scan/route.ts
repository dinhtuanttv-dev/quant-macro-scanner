import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSectorTiming } from "@/lib/locnganh/sector-timing-service";
import { planSectorIssue, planSectorResolutions, type SectorTrackRow } from "@/lib/locnganh/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

// Lọc ngành (L5) — cron hằng ngày sau job ngành của Gateway (15:50): tính lại tín hiệu ngành, GHI sổ theo dõi khi ngành vào vùng
// mua với quyết định FAVORABLE/WATCH, chấm kết quả các bản ghi đã tới ngày thoát (CAR chỉ số ngành − VN-Index).
// Bảng SectorSignalTrack tạo bằng CREATE TABLE IF NOT EXISTS (không đụng dữ liệu hiện có).
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SectorSignalTrack" (
      "id" TEXT PRIMARY KEY, "sectorCode" TEXT NOT NULL, "windowId" TEXT NOT NULL, "level" TEXT NOT NULL,
      "predictedProbability" DOUBLE PRECISION NOT NULL, "components" JSONB NOT NULL, "transitionDate" TEXT NOT NULL,
      "entryDate" TEXT NOT NULL, "plannedExitDate" TEXT NOT NULL, "issuedAt" TIMESTAMP(3) NOT NULL,
      "outcome" INTEGER, "realizedCar" DOUBLE PRECISION, "exitDate" TEXT, "outcomeRecordedAt" TIMESTAMP(3)
    );`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SectorSignalTrack_sectorCode_idx" ON "SectorSignalTrack"("sectorCode");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SectorSignalTrack_issuedAt_idx" ON "SectorSignalTrack"("issuedAt");`);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await ensureTable();
    const t = await getSectorTiming(true);
    const rows = (await prisma.sectorSignalTrack.findMany()).map((r): SectorTrackRow => ({
      ...r, level: r.level as DecisionLevel, components: (r.components ?? []) as SectorTrackRow["components"], issuedAt: r.issuedAt.toISOString(),
      outcome: r.outcome === null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: r.outcomeRecordedAt?.toISOString() ?? null,
    }));
    const now = new Date().toISOString(), benchDates = t.bench.map((b) => b.date);
    let issued = 0;
    for (const sig of t.signals) {
      const row = planSectorIssue(sig, t.details.get(sig.sectorKey)?.stats.selectedWindowId ?? null, rows, benchDates, t.asOf, now);
      if (!row) continue;
      await prisma.sectorSignalTrack.create({ data: { ...row, issuedAt: new Date(row.issuedAt), outcomeRecordedAt: null } });
      rows.push(row); issued++;
    }
    const resolutions = planSectorResolutions(rows.filter((r) => r.outcome === null), (c) => t.indexPrices.get(c), t.bench);
    for (const r of resolutions) await prisma.sectorSignalTrack.update({ where: { id: r.id }, data: { outcome: r.outcome, realizedCar: r.realizedCar, exitDate: r.exitDate, outcomeRecordedAt: new Date() } });
    return NextResponse.json({ ok: true, asOf: t.asOf, sectors: t.signals.length, issued, resolved: resolutions.length, total: rows.length,
      actions: t.signals.reduce<Record<string, number>>((m, s) => ({ ...m, [s.action]: (m[s.action] ?? 0) + 1 }), {}) });
  } catch (err) {
    console.error("[cron/sector-timing-scan]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
