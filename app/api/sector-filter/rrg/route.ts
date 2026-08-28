import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses } from "@/lib/market-data/technical-indicators";
import { calculateSectorRRG, type RRGPoint } from "@/lib/sector-filter/rrg/rrg-calculator";

export const maxDuration = 10;
const OHLCV_RANGE = "6mo";

const VN_INDEX_TICKER = "^VNINDEX.VN";
const SECTOR_PROXIES: { sectorKey: string; sectorLabel: string; proxyTicker: string }[] = [
  { sectorKey: "BANKING", sectorLabel: "Ngan hang", proxyTicker: "VCB" },
  { sectorKey: "REAL_ESTATE", sectorLabel: "Bat dong san", proxyTicker: "VHM" },
  { sectorKey: "STEEL", sectorLabel: "Thep & Vat lieu", proxyTicker: "HPG" },
  { sectorKey: "TECH", sectorLabel: "Cong nghe", proxyTicker: "FPT" },
  { sectorKey: "RETAIL", sectorLabel: "Ban le", proxyTicker: "MWG" },
  { sectorKey: "SECURITIES", sectorLabel: "Chung khoan", proxyTicker: "VCI" },
  { sectorKey: "OIL_GAS", sectorLabel: "Dau khi", proxyTicker: "GAS" },
  { sectorKey: "SHIPPING", sectorLabel: "Van tai bien", proxyTicker: "GMD" },
];

export async function GET() {
  console.log("[rrg] ===== BAT DAU - goi SONG SONG ca VN-Index + 8 nganh (khong dung timeout gia) =====");
  try {
    // QUAN TRONG: goi VN-Index CUNG LUC voi 8 ma nganh trong 1 Promise.allSettled
    // duy nhat - KHONG cho VN-Index chay truoc roi moi den 8 ma (tuan tu lam
    // cham tong thoi gian). Khong dung Promise.race+setTimeout tu che vi no
    // KHONG huy duoc request that, chi gay bao loi gia trong khi request van
    // thanh cong ngam. maxDuration=10s cua Vercel la luoi an toan that su.
    const allTickers = [VN_INDEX_TICKER, ...SECTOR_PROXIES.map((s) => s.proxyTicker)];
    const startTime = Date.now();

    const allResults = await Promise.allSettled(
      allTickers.map((ticker) => fetchOhlcvHistory(ticker, OHLCV_RANGE))
    );

    console.log(`[rrg] Da nhan du ${allResults.length} ket qua sau ${Date.now() - startTime}ms`);

    const [vnSettled, ...sectorSettled] = allResults;

    if (vnSettled.status !== "fulfilled" || !vnSettled.value?.success || !vnSettled.value.data || vnSettled.value.data.length < 63) {
      const reason = vnSettled.status === "rejected" ? vnSettled.reason : "khong du du lieu";
      console.error("[rrg] VN-Index that bai:", reason);
      return NextResponse.json({ error: "Khong lay du du lieu benchmark VN-Index de tinh RRG." }, { status: 502 });
    }

    const benchmarkCloses = extractCloses(vnSettled.value.data);
    console.log(`[rrg] VN-Index OK, ${benchmarkCloses.length} diem gia.`);

    const rrgPoints: RRGPoint[] = [];
    sectorSettled.forEach((settled, i) => {
      if (settled.status !== "fulfilled" || !settled.value?.success || !settled.value.data) {
        console.warn(`[rrg] Bo qua nganh ${SECTOR_PROXIES[i].sectorLabel} - ${settled.status === "rejected" ? settled.reason : "khong co du lieu"}`);
        return;
      }
      const sectorCloses = extractCloses(settled.value.data);
      const minLen = Math.min(sectorCloses.length, benchmarkCloses.length);
      const point = calculateSectorRRG(
        SECTOR_PROXIES[i].sectorKey, SECTOR_PROXIES[i].sectorLabel,
        sectorCloses.slice(-minLen), benchmarkCloses.slice(-minLen)
      );
      if (point) rrgPoints.push(point);
    });

    console.log(`[rrg] ===== HOAN TAT - ${rrgPoints.length}/8 diem RRG, tong ${Date.now() - startTime}ms =====`);
    return NextResponse.json({ generatedAt: new Date().toISOString(), benchmark: "VN-Index", points: rrgPoints });
  } catch (err) {
    console.error("[rrg] LOI KHONG XAC DINH:", err);
    return NextResponse.json({ error: "Khong the tinh RRG luc nay.", detail: String(err) }, { status: 500 });
  }
}