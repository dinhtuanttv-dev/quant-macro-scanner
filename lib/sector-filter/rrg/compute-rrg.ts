// lib/sector-filter/rrg/compute-rrg.ts
//
// FIX RELIABILITY (2026-09-11): truoc day route top20/route.ts tu GOI HTTP
// sang chinh route /api/sector-filter/rrg (1 vong network round-trip +
// 1 lan khoi dong serverless function RIENG BIET tren Vercel) chi de lay
// ket qua RRG - trong khi logic tinh RRG hoan toan co the goi truc tiep
// nhu 1 ham JS binh thuong. Day la nguyen nhan chinh gay rui ro vuot
// maxDuration/timeout that su da xac nhan qua nhieu lan (xem log that o
// route ingest-hose, cung loi kien truc tuong tu). Tach ra ham dung chung
// - CA HAI route (rrg/route.ts va top20/route.ts) goi TRUC TIEP ham nay,
// khong qua HTTP nua.
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses } from "@/lib/market-data/technical-indicators";
import { calculateSectorRRG, type RRGPoint } from "./rrg-calculator";

const OHLCV_RANGE = "6mo";

// Dung ETF VN30 thay ^VNINDEX.VN lam benchmark - Yahoo chi tra ve 1 nen
// cho ma chi so tong hop, khong du du lieu tinh RRG. E1VFVN30 la cong cu
// giao dich that, thanh khoan cao, du lich su.
export const VN_INDEX_TICKER = "E1VFVN30";

export const SECTOR_PROXIES: { sectorKey: string; sectorLabel: string; proxyTicker: string }[] = [
  { sectorKey: "BANKING", sectorLabel: "Ngan hang", proxyTicker: "VCB" },
  { sectorKey: "REAL_ESTATE", sectorLabel: "Bat dong san", proxyTicker: "VHM" },
  { sectorKey: "STEEL", sectorLabel: "Thep & Vat lieu", proxyTicker: "HPG" },
  { sectorKey: "TECH", sectorLabel: "Cong nghe", proxyTicker: "FPT" },
  { sectorKey: "RETAIL", sectorLabel: "Ban le", proxyTicker: "MWG" },
  { sectorKey: "SECURITIES", sectorLabel: "Chung khoan", proxyTicker: "VCI" },
  { sectorKey: "OIL_GAS", sectorLabel: "Dau khi", proxyTicker: "GAS" },
  { sectorKey: "SHIPPING", sectorLabel: "Van tai bien", proxyTicker: "GMD" },
];

export interface RRGComputeResult {
  points: RRGPoint[];
  benchmark: string;
  errors: string[]; // ly do tung nganh bi bo qua (neu co) - de debug, khong lam sap ca ket qua
}

export async function computeRRGPoints(): Promise<RRGComputeResult | null> {
  const allTickers = [VN_INDEX_TICKER, ...SECTOR_PROXIES.map((s) => s.proxyTicker)];
  const allResults = await Promise.allSettled(
    allTickers.map((ticker) => fetchOhlcvHistory(ticker, OHLCV_RANGE)),
  );

  const [vnSettled, ...sectorSettled] = allResults;

  if (vnSettled.status !== "fulfilled" || !vnSettled.value?.success || !vnSettled.value.data || vnSettled.value.data.length < 63) {
    console.error("[compute-rrg] VN30 benchmark that bai:", vnSettled.status === "rejected" ? vnSettled.reason : "khong du du lieu");
    return null;
  }

  const benchmarkCloses = extractCloses(vnSettled.value.data);
  const points: RRGPoint[] = [];
  const errors: string[] = [];

  sectorSettled.forEach((settled, i) => {
    const proxy = SECTOR_PROXIES[i];
    if (settled.status !== "fulfilled" || !settled.value?.success || !settled.value.data) {
      const reason = settled.status === "rejected" ? String(settled.reason) : "khong co du lieu";
      errors.push(`${proxy.sectorLabel}: ${reason}`);
      return;
    }
    const sectorCloses = extractCloses(settled.value.data);
    const minLen = Math.min(sectorCloses.length, benchmarkCloses.length);
    const point = calculateSectorRRG(
      proxy.sectorKey, proxy.sectorLabel,
      sectorCloses.slice(-minLen), benchmarkCloses.slice(-minLen),
    );
    if (point) points.push(point);
    else errors.push(`${proxy.sectorLabel}: khong du du lieu de tinh RRG (can toi thieu 63 phien)`);
  });

  return { points, benchmark: "VN-Index (proxy E1VFVN30)", errors };
}
