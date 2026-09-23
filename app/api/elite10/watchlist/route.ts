import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Elite 10 - "Danh sach ma" THAT: hop nhat 3 nguon da co san va DA CHAY
// THAT tu truoc (KHONG viet lai logic, chi goi lai + port 2 ham nho vi
// Backend/Frontend la 2 repo TACH BIET, khong import cheo duoc):
//   - /api/pattern-scan (Pattern Scanner that, quet VN30/VN100)
//   - /api/convergence-scan (Bo Loc Hop Luu Wyckoff+SMC+FVG, quet
//     VN30/VN100 - dung mot implementation SMC/Wyckoff KHAC voi
//     lib/elite10/smc-detector.ts, da ghi ro trong bao cao ra soat)
//   - "Dong Thuan TA": PORT Y HET 2 ham selectGoldenFilter() +
//     computeTAConsensus() tu global-quanta/src/lib/ta-command-center/
//     golden-filter/ (khong doi cong thuc, chi copy sang moi truong
//     Backend de co the goi tu 1 route duy nhat).
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface PatternMatch { ticker: string; sector: string; pattern: string; patternLabel: string; tag: string; confidenceScore: number; status: "forming" | "confirmed"; }
interface ConvergenceResult { ticker: string; sector: string; wyckoffPhase: string; compositeScore: number; }

interface GoldenFilterStock { ticker: string; sector: string; pattern: string; patternLabel: string; tag: string; confidenceScore: number; status: "forming" | "confirmed"; }

/** PORT nguyen ban tu global-quanta/src/lib/ta-command-center/golden-filter/goldenFilterEngine.ts */
function selectGoldenFilter(matches: PatternMatch[], topN = 20): GoldenFilterStock[] {
  const bestPerTicker = new Map<string, PatternMatch>();
  matches.forEach((m) => {
    const existing = bestPerTicker.get(m.ticker);
    if (!existing || m.confidenceScore > existing.confidenceScore) bestPerTicker.set(m.ticker, m);
  });
  return Array.from(bestPerTicker.values()).sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, topN);
}

type TAConsensusLabel = "Elite Convergence" | "Golden Intersection" | "Convergence Only" | "Pattern Only";
interface TAConsensusResult {
  ticker: string; sector: string; inGoldenFilter: boolean; inConvergenceFilter: boolean;
  goldenScore: number | null; convergenceScore: number | null; wyckoffPhase: string | null;
  taConsensusScore: number; label: TAConsensusLabel;
}

/** PORT nguyen ban tu global-quanta/src/lib/ta-command-center/golden-filter/taConsensus.ts */
function computeTAConsensus(goldenFilter: GoldenFilterStock[], convergenceResults: ConvergenceResult[]): TAConsensusResult[] {
  const goldenMap = new Map(goldenFilter.map((g) => [g.ticker, g]));
  const convMap = new Map(convergenceResults.map((c) => [c.ticker, c]));
  const allTickers = new Set([...goldenMap.keys(), ...convMap.keys()]);

  const results: TAConsensusResult[] = Array.from(allTickers).map((ticker) => {
    const golden = goldenMap.get(ticker);
    const conv = convMap.get(ticker);
    const isIntersection = !!golden && !!conv;

    let taConsensusScore = 0;
    if (golden && conv) taConsensusScore = Math.round(Math.min(100, golden.confidenceScore * 0.5 + conv.compositeScore * 0.5 + 15));
    else if (golden) taConsensusScore = Math.round(golden.confidenceScore * 0.7);
    else if (conv) taConsensusScore = Math.round(conv.compositeScore * 0.7);

    let label: TAConsensusLabel;
    if (isIntersection) label = taConsensusScore >= 80 ? "Elite Convergence" : "Golden Intersection";
    else if (conv) label = "Convergence Only";
    else label = "Pattern Only";

    return {
      ticker, sector: golden?.sector ?? conv?.sector ?? "-",
      inGoldenFilter: !!golden, inConvergenceFilter: !!conv,
      goldenScore: golden?.confidenceScore ?? null, convergenceScore: conv?.compositeScore ?? null,
      wyckoffPhase: conv?.wyckoffPhase ?? null, taConsensusScore, label,
    };
  });
  results.sort((a, b) => b.taConsensusScore - a.taConsensusScore);
  return results;
}

export async function GET(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") ?? "all").toLowerCase();

    const [patternRes, convergenceRes] = await Promise.all([
      fetch(`${origin}/api/pattern-scan`, { cache: "no-store" }),
      fetch(`${origin}/api/convergence-scan`, { cache: "no-store" }),
    ]);

    if (!patternRes.ok || !convergenceRes.ok) {
      return NextResponse.json({ error: "Không thể tải danh sách mã lúc này (nguồn Pattern Scanner/Convergence Scan lỗi)." }, { status: 502 });
    }

    const patternData = await patternRes.json();
    const convergenceData = await convergenceRes.json();

    const goldenFilter = selectGoldenFilter(patternData.matches ?? [], 20);
    const consensus = computeTAConsensus(goldenFilter, convergenceData.results ?? []);
    const top20 = consensus.slice(0, 20);

    // Lay changePct THAT tu SieuQuetStockItem (da co san, cron
    // sieu-quet-scan cap nhat hang ngay) - TRANH bia % = 0 khi khong co
    // du lieu that (khac voi route mock cu, minh bach ro MISSING neu
    // ma khong nam trong 75 ma Sieu Quet AI).
    const tickers = top20.map((r) => r.ticker);
    const priceRows = await prisma.sieuQuetStockItem.findMany({
      where: { ticker: { in: tickers } },
      select: { ticker: true, changePct: true },
    });
    const priceMap = new Map(priceRows.map((p) => [p.ticker, p.changePct]));

    // Map sang dung format TickerListItem (Elite 10 Frontend da ky vong):
    // {ticker, changePct, status, badge}.
    let items = top20.map((r) => {
      const realChangePct = priceMap.get(r.ticker);
      return {
        ticker: r.ticker,
        changePct: realChangePct !== undefined && realChangePct !== null
          ? { value: realChangePct, source: "HARD_DATA" as const }
          : { value: 0, source: "MISSING" as const },
        status: r.label === "Elite Convergence" ? ("core" as const) : r.label === "Golden Intersection" ? ("ring" as const) : ("watch" as const),
        badge: r.label,
      };
    });

    if (filter === "core") items = items.filter((i) => i.status === "core");
    else if (filter === "ring") items = items.filter((i) => i.status === "ring");
    else if (filter === "pinned") items = items.slice(0, 5);

    return NextResponse.json(items);
  } catch (err) {
    console.error("[api/elite10/watchlist] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải danh sách mã lúc này." }, { status: 500 });
  }
}
