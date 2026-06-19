// 1. IMPORT CÁC THÀNH PHẦN CẦN THIẾT
// Lưu ý: Nếu các file nằm ở thư mục khác, hãy sửa lại đường dẫn ./ thành ../ nếu cần
import { UniverseStock, Tang1Stock, Tang2Stock } from "./types";
import { globalIndicesSectors, commoditiesImpact } from "./data";

// 2. HÀM TÍNH TOÁN TẦNG 2
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

  // Tính toán và ép kiểu (as Tang2Stock) để hết lỗi thiếu thuộc tính
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
      tang1Score: inTang1 ? 20 : 0,
    } as Tang2Stock; 
  });

  return scored.sort((a, b) => b.tang2Score - a.tang2Score).slice(0, 20);
}