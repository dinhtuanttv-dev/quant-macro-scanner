// 1. IMPORT CÁC THƯ VIỆN VÀ DỮ LIỆU
// Hãy kiểm tra đường dẫn "./types" và "./data" 
// Nếu file types.ts hoặc data.ts nằm ở thư mục khác, hãy sửa lại đường dẫn (ví dụ: "../types/types")
import {
  UniverseStock,
  Tang1Stock,
  Tang2Stock,
} from "./types";

import {
  globalIndicesSectors,
  commoditiesImpact,
} from "./data";

// 2. HÀM TÍNH TOÁN TẦNG 2
export function computeTang2(
  tang1List: Tang1Stock[],
  fullUniverse: UniverseStock[]
): Tang2Stock[] {
  // Chuẩn bị dữ liệu hỗ trợ
  const globalFavoredSectors = new Set<string>();
  globalIndicesSectors.forEach((g) =>
    g.vnSectorsFavored.forEach((s) => globalFavoredSectors.add(s))
  );

  const commodityFavoredSectors = new Set(
    commoditiesImpact.filter((c) => c.trend === "Up").map((c) => c.sectorFavored)
  );

  const t1Tickers = new Set(tang1List.map((t) => t.ticker));

  // Tính toán điểm số
  const scored: Tang2Stock[] = fullUniverse.map((s) => {
    const inTang1 = t1Tickers.has(s.ticker);
    const globalBonus = globalFavoredSectors.has(s.sector) ? 14 : 0;
    const commBonus = commodityFavoredSectors.has(s.sector) ? 10 : 0;
    const baseScore = s.faScore * 0.4 + Math.min(s.epsGrowth, 35) * 0.9;
    
    // Đảm bảo trả về đủ các thuộc tính của Tang2Stock
    return {
      ...s, // Lấy các thuộc tính từ UniverseStock
      tang1Member: inTang1,
      globalSync: globalFavoredSectors.has(s.sector),
      commoditySync: commodityFavoredSectors.has(s.sector),
      tang2Score: baseScore + globalBonus + commBonus + (inTang1 ? 8 : 0),
      tang1Score: inTang1 ? 20 : 0, // Giá trị mặc định cho tang1Score
    };
  });

  return scored.sort((a, b) => b.tang2Score - a.tang2Score).slice(0, 20);
}