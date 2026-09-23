// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 2/4: tom tat du lieu tu 3
// nguon THAT da co san (Confluence Engine, SMC/Wyckoff, Time Engine)
// thanh 1 "goi du lieu" gon gang de dua vao prompt AI - KHONG goi lai
// route nao MOI, chi FETCH NOI BO 3 route DA CO (giong cach golden-filter
// da lam voi pattern-scan/scored-stocks), va CHON LOC cac truong quan
// trong nhat (khong dua toan bo raw JSON qua lon vao prompt).
export interface DebateDataPackage {
  ticker: string;
  confluence: { score: number | null; starRating: number | null; sourcesUsed: string | null; riskFlags: string[] } | null;
  smc: {
    fvgUnmitigated: number | null; structureBias: string | null; lastEventType: string | null;
    wyckoffStatus: string | null; vcpAvailable: boolean;
    tripleBarrierSummary: { pattern: string; winRatePct: number; sampleSize: number; stabilityFlag: string }[];
  } | null;
  timeEngine: { verdict: string | null; currentWindowLabel: string | null; currentWindowAvgReturn: number | null; disclaimer: string | null } | null;
  fetchErrors: string[];
}

async function safeFetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function buildDebateDataPackage(origin: string, ticker: string): Promise<DebateDataPackage> {
  const fetchErrors: string[] = [];

  const [confluenceRaw, smcRaw, cycleRaw] = await Promise.all([
    safeFetchJson(`${origin}/api/elite10/confluence/${ticker}`),
    safeFetchJson(`${origin}/api/elite10/smc/${ticker}`),
    safeFetchJson(`${origin}/api/elite10/cycle?ticker=${ticker}`),
  ]);

  if (!confluenceRaw) fetchErrors.push("confluence");
  if (!smcRaw) fetchErrors.push("smc");
  if (!cycleRaw) fetchErrors.push("cycle");

  const confluence = confluenceRaw
    ? { score: confluenceRaw.score ?? null, starRating: confluenceRaw.starRating ?? null, sourcesUsed: confluenceRaw.sourcesUsed ?? null, riskFlags: confluenceRaw.riskFlags ?? [] }
    : null;

  let smc: DebateDataPackage["smc"] = null;
  if (smcRaw) {
    const tb = smcRaw.tripleBarrierBacktest;
    const st = smcRaw.stability;
    const tripleBarrierSummary: NonNullable<DebateDataPackage["smc"]>["tripleBarrierSummary"] = [];
    const patternKeys: [string, string][] = [
      ["fvgBullish", "FVG tăng"], ["fvgBearish", "FVG giảm"],
      ["bosBullish", "BOS tăng"], ["bosBearish", "BOS giảm"],
      ["chochBullish", "CHoCH tăng"], ["chochBearish", "CHoCH giảm"],
      ["orderBlockBullish", "Order Block tăng"], ["orderBlockBearish", "Order Block giảm"],
    ];
    for (const [key, label] of patternKeys) {
      const stat = tb?.[key];
      if (stat && stat.sampleSize > 0) {
        const stability = st?.[key];
        tripleBarrierSummary.push({
          pattern: label, winRatePct: stat.winRatePct, sampleSize: stat.sampleSize,
          stabilityFlag: stability?.flagUnstable ? "KHÔNG ỔN ĐỊNH qua thời gian" : (stability?.stabilityScorePct !== null && stability?.stabilityScorePct !== undefined ? `${stability.stabilityScorePct}% giai đoạn nhất quán` : "chưa đủ mẫu để đánh giá ổn định"),
        });
      }
    }
    smc = {
      fvgUnmitigated: smcRaw.fvg?.unmitigated ?? null,
      structureBias: smcRaw.structure?.currentBias ?? null,
      lastEventType: smcRaw.structure?.lastEventType ?? null,
      wyckoffStatus: smcRaw.wyckoff?.status ?? null,
      vcpAvailable: false, // VCP nam o route /api/ta-vn-index/analyze khac, chua ket noi vao day
      tripleBarrierSummary,
    };
  }

  const timeEngine = cycleRaw
    ? {
        verdict: cycleRaw.verdict?.action ?? null,
        currentWindowLabel: cycleRaw.verdict?.currentWindow?.label ?? null,
        currentWindowAvgReturn: cycleRaw.verdict?.currentWindow?.avgReturn ?? null,
        disclaimer: cycleRaw.verdict?.disclaimer ?? null,
      }
    : null;

  return { ticker, confluence, smc, timeEngine, fetchErrors };
}
