import {
  UniverseStock,
  Tang1Stock,
  Tang2Stock,
  Tang3Stock,
  Tang4Stock,
  ConfluenceStock,
  FunnelResult,
} from "./types";
import {
  globalIndicesSectors,
  commoditiesImpact,
  sectorsData,
  taSignalPool,
} from "./data";

// ============ TANG 1: Sieu quet AI (FA + EPS Growth) -> Top 20 ============
export function computeTang1(universe: UniverseStock[]): Tang1Stock[] {
  const scored: Tang1Stock[] = universe.map((s) => ({
    ...s,
    tang1Score: s.faScore * 0.55 + Math.min(s.epsGrowth, 35) * 1.3,
  }));
  return scored.sort((a, b) => b.tang1Score - a.tang1Score).slice(0, 20);
}

// ============ TANG 2: Ket noi the gioi (dong thuan nganh + hang hoa) -> Top 20 ============
export function computeTang2(
  tang1List: Tang1Stock[],
  fullUniverse: UniverseStock[]
): Tang2Stock[] {
  const globalFavoredSectors = new Set<string>();
  globalIndicesSectors.forEach((g) =>
    g.vnSectorsFavored.forEach((s) => globalFavoredSectors.add(s))
  );
  const commodityFavoredSectors = new Set<string>(
    commoditiesImpact.filter((c) => c.trend === "Up").map((c) => c.sectorFavored)
  );

  const t1Tickers = new Set(tang1List.map((t) => t.ticker));

  const scored: Tang2Stock[] = fullUniverse.map((s) => {
    const inTang1 = t1Tickers.has(s.ticker);
    const globalBonus = globalFavoredSectors.has(s.sector) ? 14 : 0;
    const commBonus = commodityFavoredSectors.has(s.sector) ? 10 : 0;
    const baseScore = s.faScore * 0.4 + Math.min(s.epsGrowth, 35) * 0.9;
    return {
      ...s,
      tang1Member: inTang1,
      globalSync: globalFavoredSectors.has(s.sector),
      commoditySync: commodityFavoredSectors.has(s.sector),
      tang2Score: baseScore + globalBonus + commBonus + (inTang1 ? 8 : 0),
    };
  }) as Tang2Stock[];

  return scored.sort((a, b) => b.tang2Score - a.tang2Score).slice(0, 20);
}

// ============ TANG 3: Suc manh xung luc nganh -> Top 20 ============
export function computeTang3(tang2List: Tang2Stock[]): Tang3Stock[] {
  const sectorStrengthMap: Record<string, number> = {};
  sectorsData.forEach((s) => {
    sectorStrengthMap[s.name] = s.strength;
  });

  const scored: Tang3Stock[] = tang2List.map((s) => {
    const strength = sectorStrengthMap[s.sector] ?? 50;
    return {
      ...s,
      sectorStrength: strength,
      tang3Score: s.tang2Score * 0.6 + strength * 0.5,
    };
  });

  return scored.sort((a, b) => b.tang3Score - a.tang3Score).slice(0, 20);
}

// ============ TANG 4: TA + Foreign Flow -> Top 20 ============
export function computeTang4(tang3List: Tang3Stock[]): Tang4Stock[] {
  const scored: Tang4Stock[] = tang3List.map((s) => {
    const ta = taSignalPool[s.ticker] ?? null;
    const breakoutBonus = ta?.breakout ? 12 : 0;
    const volBonus = ta ? Math.min(ta.volSpike, 2.5) * 6 : 0;
    const foreignBonus = ta
      ? Math.max(Math.min(ta.foreignNet / 10, 12), -12)
      : 0;
    const leaderBonus = ta?.leader ? 10 : 0;
    const ma50Penalty =
      ta?.ma50Status === "broken" ? -40 : ta?.ma50Status === "warning" ? -10 : 0;

    return {
      ...s,
      taData: ta,
      tang4Score:
        s.tang3Score * 0.5 +
        breakoutBonus +
        volBonus +
        foreignBonus +
        leaderBonus +
        ma50Penalty,
    };
  });

  return scored.sort((a, b) => b.tang4Score - a.tang4Score).slice(0, 20);
}

// ============ CONFLUENCE: combine all 4 layers -> Elite 10 + reserve list ============
export function computeConfluence(
  tang1: Tang1Stock[],
  tang2: Tang2Stock[],
  tang3: Tang3Stock[],
  tang4: Tang4Stock[],
  fullUniverse: UniverseStock[]
): ConfluenceStock[] {
  const allTickers = new Set<string>([
    ...tang1.map((s) => s.ticker),
    ...tang2.map((s) => s.ticker),
    ...tang3.map((s) => s.ticker),
    ...tang4.map((s) => s.ticker),
  ]);

  const t1Set = new Set(tang1.map((s) => s.ticker));
  const t2Set = new Set(tang2.map((s) => s.ticker));
  const t3Set = new Set(tang3.map((s) => s.ticker));
  const t4Map: Record<string, Tang4Stock> = {};
  tang4.forEach((s) => {
    t4Map[s.ticker] = s;
  });

  const results: ConfluenceStock[] = Array.from(allTickers).map((ticker) => {
    const base = fullUniverse.find((s) => s.ticker === ticker);
    const inT1 = t1Set.has(ticker);
    const inT2 = t2Set.has(ticker);
    const inT3 = t3Set.has(ticker);
    const t4Entry = t4Map[ticker];
    const inT4 = t4Entry !== undefined;
    const matchCount = [inT1, inT2, inT3, inT4].filter(Boolean).length;
    const confluenceBonus =
      matchCount === 4 ? 25 : matchCount === 3 ? 12 : matchCount === 2 ? 4 : 0;
    const t4Score = t4Entry ? t4Entry.tang4Score : 0;
    const finalScore = Math.round((t4Score + confluenceBonus) * 10) / 10;

    return {
      ticker,
      sector: base ? base.sector : "—",
      inT1,
      inT2,
      inT3,
      inT4,
      matchCount,
      confluenceBonus,
      finalScore,
      taData: t4Entry ? t4Entry.taData : taSignalPool[ticker] ?? null,
    };
  });

  return results.sort((a, b) => b.finalScore - a.finalScore);
}

// ============ FULL PIPELINE HELPER (runs all 4 layers + confluence in one call) ============
export function runFullFunnel(universe: UniverseStock[]): FunnelResult {
  const tang1 = computeTang1(universe);
  const tang2 = computeTang2(tang1, universe);
  const tang3 = computeTang3(tang2);
  const tang4 = computeTang4(tang3);
  const confluence = computeConfluence(tang1, tang2, tang3, tang4, universe);

  return {
    tang1,
    tang2,
    tang3,
    tang4,
    confluence,
    eliteTop10: confluence.slice(0, 10),
    reserve11: confluence[10] ?? null,
  };
}