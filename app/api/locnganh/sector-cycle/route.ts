import { NextResponse } from "next/server";
import { getSectorTiming } from "@/lib/locnganh/sector-timing-service";

// Lọc ngành (L2) — chi tiết một ngành cho bảng phụ: thống kê mọi cửa sổ (CycleStatsV3 ngành), đường CAR quanh các lần chuyển
// vào Improving (cho CycleTimeline), quyết định + entry plan, vệt RRG 26 tuần.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("code") ?? "";
  const code = raw.padStart(4, "0");
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: "Thiếu hoặc sai mã ngành (code)." }, { status: 400 });
  try {
    const t = await getSectorTiming();
    const d = t.details.get(code);
    if (!d) return NextResponse.json({ error: `Không có ngành ${code}.` }, { status: 404 });
    return NextResponse.json(
      { version: t.version, asOf: t.asOf, evidence: t.evidence, windows: t.windows, signal: t.signals.find((s) => s.sectorKey === code) ?? null, ...d },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } },
    );
  } catch (err) {
    console.error("[locnganh/sector-cycle]", err);
    return NextResponse.json({ error: "Không tính được chi tiết ngành lúc này.", detail: String(err) }, { status: 502 });
  }
}
