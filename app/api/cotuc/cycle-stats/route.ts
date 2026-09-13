import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeWindowStats, type WindowReturns } from "@/lib/cotuc/dividend-cycle-engine";

// Timing Engine (P3) - doc du lieu DA QUET SAN (Cron Job dividend-cycle-
// scan) va tinh bootstrap + xep hang REAL-TIME (nhanh, du lieu da co san
// trong DB, khong can goi VCI/Yahoo). Ho tro 2 che do:
//   - Khong truyen ticker: tong hop TOAN BO thi truong (giong Tab B)
//   - Co ticker: loc rieng ma do (giong Tab C)
export const dynamic = "force-dynamic";

interface CycleWindowRow {
  ticker: string; exDate: Date; divType: string;
  wM1: number | null; wPreAgm: number | null; wPreEx: number | null;
  wPostEx: number | null; wPostCredit: number | null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.toUpperCase() ?? null;
    const costPct = parseFloat(searchParams.get("costPct") ?? "0.15");
    const bootN = Math.max(200, parseInt(searchParams.get("bootN") ?? "2000", 10));
    const mode = searchParams.get("mode"); // "rankAll" -> xep hang tung ma theo cua so tot nhat cua chinh no

    if (mode === "rankAll") {
      const allRows: CycleWindowRow[] = await prisma.dividendCycleWindow.findMany();
      const tickerGroups = new Map<string, CycleWindowRow[]>();
      allRows.forEach((r) => {
        const list = tickerGroups.get(r.ticker) ?? [];
        list.push(r);
        tickerGroups.set(r.ticker, list);
      });

      const ranking = Array.from(tickerGroups.entries()).map(([t, rowsForTicker]) => {
        const asWr: WindowReturns[] = rowsForTicker.map((r) => ({
          w_m1: r.wM1, w_pre_agm: r.wPreAgm, w_pre_ex: r.wPreEx, w_post_ex: r.wPostEx, w_post_credit: r.wPostCredit,
        }));
        const s = computeWindowStats(asWr, costPct, bootN).filter((x) => x.n > 0);
        if (s.length === 0) return null;
        const best = s.reduce((a, b) => (b.score! > a.score! ? b : a));
        return { ticker: t, nCycles: rowsForTicker.length, best };
      }).filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => (b.best.score ?? 0) - (a.best.score ?? 0));

      return NextResponse.json({ generatedAt: new Date().toISOString(), ranking });
    }

    const rows: CycleWindowRow[] = ticker
      ? await prisma.dividendCycleWindow.findMany({ where: { ticker }, orderBy: { exDate: "desc" } })
      : await prisma.dividendCycleWindow.findMany();

    const asWindowReturns: WindowReturns[] = rows.map((r) => ({
      w_m1: r.wM1, w_pre_agm: r.wPreAgm, w_pre_ex: r.wPreEx, w_post_ex: r.wPostEx, w_post_credit: r.wPostCredit,
    }));

    const stats = computeWindowStats(asWindowReturns, costPct, bootN);
    const validStats = stats.filter((s) => s.n > 0);
    const best = validStats.length > 0 ? validStats.reduce((a, b) => (b.score! > a.score! ? b : a)) : null;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ticker,
      totalEvents: rows.length,
      history: rows.map((r) => ({
        exDate: r.exDate.toISOString().slice(0, 10), divType: r.divType,
        w_m1: r.wM1, w_pre_agm: r.wPreAgm, w_pre_ex: r.wPreEx, w_post_ex: r.wPostEx, w_post_credit: r.wPostCredit,
      })),
      windowStats: stats,
      bestWindow: best,
    });
  } catch (err) {
    console.error("[api/cotuc/cycle-stats] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Timing Engine lúc này." }, { status: 500 });
  }
}
