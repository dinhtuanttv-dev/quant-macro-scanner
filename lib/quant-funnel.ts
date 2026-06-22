import { globalIndicesSectors, commoditiesImpact, sectorsData, taSignalPool } from "./quant-data";

export interface UniverseStock {
  ticker: string;
  sector: string;
  epsGrowth: number;
  faScore: number;
}

export interface Tang1Stock extends UniverseStock {
  tang1Score: number;
}

export interface Tang2Stock extends Tang1Stock {
  tang1Member: boolean;
  globalSync: boolean;
  commoditySync: boolean;
  tang2Score: number;
}

export interface Tang3Stock extends Tang2Stock {
  sectorStrength: number;
  tang3Score: number;
}

export interface Tang4Stock extends Tang3Stock {
  taData: typeof taSignalPool[string] | null;
  tang4Score: number;
}

export interface ConfluenceStock {
  ticker: string;
  sector: string;
  inT1: boolean;
  inT2: boolean;
  inT3: boolean;
  inT4: boolean;
  matchCount: number;
  confluenceBonus: number;
  finalScore: number;
  taData: typeof taSignalPool[string] | null;
}

export function computeTang1(universe: UniverseStock[]): Tang1Stock[] {
  const scored = universe.map((s) => ({
    ...s,
    tang1Score: s.faScore * 0.55 + Math.min(s.epsGrowth, 35) * 1.3,
  }));
  return scored.sort((a, b) => b.tang1Score - a.tang1Score).slice(0, 20);
}

export function computeTang2(tang1List: Tang1Stock[], fullUniverse: UniverseStock[]): Tang2Stock[] {
  const globalFavoredSectors = new Set<string>();
  globalIndicesSectors.forEach((g) => g.vnSectorsFavored.forEach((s) => globalFavoredSectors.add(s)));
  const commodityFavoredSectors = new Set<string>(
    commoditiesImpact.filter((c) => c.trend === "Up").map((c) => c.sectorFavored)
  );
  const t1Tickers = new Set(tang1List.map((t) => t.ticker));

  const scored = fullUniverse.map((s) => {
    const inTang1 = t1Tickers.has(s.ticker);
    const globalBonus = globalFavoredSectors.has(s.sector) ? 14 : 0;
    const commBonus = commodityFavoredSectors.has(s.sector) ? 10 : 0;
    const baseScore = s.faScore * 0.4 + Math.min(s.epsGrowth, 35) * 0.9;
    return {
      ...s,
      tang1Score: 0,
      tang1Member: inTang1,
      globalSync: globalFavoredSectors.has(s.sector),
      commoditySync: commodityFavoredSectors.has(s.sector),
      tang2Score: baseScore + globalBonus + commBonus + (inTang1 ? 8 : 0),
    } as Tang2Stock;
  });

  return scored.sort((a, b) => b.tang2Score - a.tang2Score).slice(0, 20);
}

export function computeTang3(tang2List: Tang2Stock[]): Tang3Stock[] {
  const sectorStrengthMap: Record<string, number> = {};
  sectorsData.forEach((s) => { sectorStrengthMap[s.name] = s.strength; });

  const scored = tang2List.map((s) => {
    const strength = sectorStrengthMap[s.sector] ?? 50;
    return { ...s, sectorStrength: strength, tang3Score: s.tang2Score * 0.6 + strength * 0.5 };
  });

  return scored.sort((a, b) => b.tang3Score - a.tang3Score).slice(0, 20);
}

export function computeTang4(tang3List: Tang3Stock[]): Tang4Stock[] {
  const scored = tang3List.map((s) => {
    const ta = taSignalPool[s.ticker] ?? null;
    const breakoutBonus = ta?.breakout ? 12 : 0;
    const volBonus = ta ? Math.min(ta.volSpike, 2.5) * 6 : 0;
    const foreignBonus = ta ? Math.max(Math.min(ta.foreignNet / 10, 12), -12) : 0;
    const leaderBonus = ta?.leader ? 10 : 0;
    const ma50Penalty = ta?.ma50Status === "broken" ? -40 : ta?.ma50Status === "warning" ? -10 : 0;
    return {
      ...s,
      taData: ta,
      tang4Score: s.tang3Score * 0.5 + breakoutBonus + volBonus + foreignBonus + leaderBonus + ma50Penalty,
    };
  });

  return scored.sort((a, b) => b.tang4Score - a.tang4Score).slice(0, 20);
}

export function computeConfluence(
  tang1: Tang1Stock[], tang2: Tang2Stock[], tang3: Tang3Stock[], tang4: Tang4Stock[],
  fullUniverse: UniverseStock[]
): ConfluenceStock[] {
  const allTickers = new Set<string>([
    ...tang1.map((s) => s.ticker), ...tang2.map((s) => s.ticker),
    ...tang3.map((s) => s.ticker), ...tang4.map((s) => s.ticker),
  ]);

  const t1Set = new Set(tang1.map((s) => s.ticker));
  const t2Set = new Set(tang2.map((s) => s.ticker));
  const t3Set = new Set(tang3.map((s) => s.ticker));
  const t4Map: Record<string, Tang4Stock> = {};
  tang4.forEach((s) => { t4Map[s.ticker] = s; });

  const results = Array.from(allTickers).map((ticker) => {
    const base = fullUniverse.find((s) => s.ticker === ticker);
    const inT1 = t1Set.has(ticker);
    const inT2 = t2Set.has(ticker);
    const inT3 = t3Set.has(ticker);
    const t4Entry = t4Map[ticker];
    const inT4 = t4Entry !== undefined;
    const matchCount = [inT1, inT2, inT3, inT4].filter(Boolean).length;
    const confluenceBonus = matchCount === 4 ? 25 : matchCount === 3 ? 12 : matchCount === 2 ? 4 : 0;
    const t4Score = t4Entry ? t4Entry.tang4Score : 0;
    const finalScore = Math.round((t4Score + confluenceBonus) * 10) / 10;

    return {
      ticker,
      sector: base ? base.sector : "?",
      inT1, inT2, inT3, inT4,
      matchCount,
      confluenceBonus,
      finalScore,
      taData: t4Entry ? t4Entry.taData : taSignalPool[ticker] ?? null,
    };
  });

  return results.sort((a, b) => b.finalScore - a.finalScore);
}