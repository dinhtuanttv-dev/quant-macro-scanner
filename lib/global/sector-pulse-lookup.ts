// Giai Trinh Hoi Tu - Giai doan 2: tra cuu hieu suat nganh/khu vuc THAT
// (dung lai computeAsiaBasketProxy da co trong app/api/global/sector-
// pulse/route.ts, KHONG COPY-PASTE logic tinh toan) cho 1 nganh cu the -
// dung de sinh cau giai thich cho pillar "macro" (Ket noi the gioi).
//
// CHI 2 basket Chau A da xac minh duoc ticker dang tin cay (xem comment
// goc trong sector-pulse/route.ts) - MISSING minh bach cho nganh khac,
// KHONG bia so lieu.
import { computeAsiaBasketProxy } from "@/lib/asia-sector-proxy";

const ASIA_SECTOR_BASKETS: Record<string, { labelVi: string; tickers: string[] }> = {
  SEMICONDUCTOR_TECH: { labelVi: "Công nghệ / Bán dẫn", tickers: ["2330.TW", "005930.KS", "000660.KS"] },
  BANKING_FINANCE: { labelVi: "Tài chính / Ngân hàng", tickers: ["D05.SI", "HDFCBANK.NS"] },
};

// Anh xa TU DO ngan gon (tu field "sector" cua ma VN, VD "Công nghệ")
// SANG dung basket Chau A - chi anh xa duoc nganh CO basket xac minh,
// cac nganh khac tra ve null (MISSING, khong bia).
function mapSectorToAsiaBasketKey(sectorVi: string | null | undefined): string | null {
  if (!sectorVi) return null;
  const s = sectorVi.toLowerCase();
  if (s.includes("công nghệ") || s.includes("bán dẫn")) return "SEMICONDUCTOR_TECH";
  if (s.includes("tài chính") || s.includes("ngân hàng") || s.includes("chứng khoán")) return "BANKING_FINANCE";
  return null;
}

export interface AsiaSectorPulseResult {
  basketLabelVi: string;
  changePercent: number;
}

export async function getAsiaSectorPulseForSector(sectorVi: string | null | undefined): Promise<AsiaSectorPulseResult | null> {
  const basketKey = mapSectorToAsiaBasketKey(sectorVi);
  if (!basketKey) return null;
  const basket = ASIA_SECTOR_BASKETS[basketKey];
  try {
    const result = await computeAsiaBasketProxy(basket.tickers);
    if (result.changePercent === null) return null;
    return { basketLabelVi: basket.labelVi, changePercent: result.changePercent };
  } catch (err) {
    console.error("[sector-pulse-lookup] Lỗi lấy hiệu suất ngành Châu Á:", err);
    return null;
  }
}
