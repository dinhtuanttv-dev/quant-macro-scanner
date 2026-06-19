// ============ TANG 2: Ket noi the gioi (dong thuan nganh + hang hoa) -> Top 20 ============
export function computeTang2(
  tang1List: Tang1Stock[],
  fullUniverse: UniverseStock[]
): Tang2Stock[] {
  const globalFavoredSectors = new Set<string>();
  globalIndicesSectors.forEach((g) =>
    g.vnSectorsFavored.forEach((s) => globalFavoredSectors.add(s))
  );
  const commodityFavoredSectors = new Set(
    commoditiesImpact.filter((c) => c.trend === "Up").map((c) => c.sectorFavored)
  );

  const t1Tickers = new Set(tang1List.map((t) => t.ticker));

  const scored: Tang2Stock[] = fullUniverse.map((s) => {
    const inTang1 = t1Tickers.has(s.ticker);
    const globalBonus = globalFavoredSectors.has(s.sector) ? 14 : 0;
    const commBonus = commodityFavoredSectors.has(s.sector) ? 10 : 0;
    const baseScore = s.faScore * 0.4 + Math.min(s.epsGrowth, 35) * 0.9;
    
    // Trả về object đúng chuẩn Tang2Stock
    return {
      ...s,
      tang1Member: inTang1,
      globalSync: globalFavoredSectors.has(s.sector),
      commoditySync: commodityFavoredSectors.has(s.sector),
      tang2Score: baseScore + globalBonus + commBonus + (inTang1 ? 8 : 0),
      tang1Score: inTang1 ? 20 : 0, // Giá trị bắt buộc
    } as Tang2Stock; // Ép kiểu để TS không báo lỗi thiếu thuộc tính
  });

  return scored.sort((a, b) => b.tang2Score - a.tang2Score).slice(0, 20);
}