import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses } from "@/lib/market-data/technical-indicators";
import { calculateSectorRRG, type RRGPoint } from "@/lib/sector-filter/rrg/rrg-calculator";

export const maxDuration = 10;

// LUU Y: dung range "6mo" (KHONG phai "1y") cho ^VNINDEX.VN - da xac minh
// qua debug thuc te: voi range "1y", Yahoo Finance chi tra ve 1 diem du
// lieu cho ticker chi so nay (khac voi co phieu thuong tra du 262 diem).
// "6mo" da duoc chung minh hoat dong dung trong scored-stocks/route.ts.
const OHLCV_RANGE = "6mo";

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
  try {
    const vnResult = await fetchOhlcvHistory("^VNINDEX.VN", OHLCV_RANGE);
    if (!vnResult.success || !vnResult.data || vnResult.data.length < 63) {
      return NextResponse.json({ error: "Khong lay du du lieu benchmark VN-Index de tinh RRG." }, { status: 502 });
    }
    const benchmarkCloses = extractCloses(vnResult.data);

    const sectorResults = await Promise.all(
      SECTOR_PROXIES.map((s) => fetchOhlcvHistory(s.proxyTicker, OHLCV_RANGE))
    );

    const rrgPoints: RRGPoint[] = [];
    sectorResults.forEach((res, i) => {
      if (!res.success || !res.data) return;
      const sectorCloses = extractCloses(res.data);
      const minLen = Math.min(sectorCloses.length, benchmarkCloses.length);
      const point = calculateSectorRRG(
        SECTOR_PROXIES[i].sectorKey, SECTOR_PROXIES[i].sectorLabel,
        sectorCloses.slice(-minLen), benchmarkCloses.slice(-minLen)
      );
      if (point) rrgPoints.push(point);
    });

    return NextResponse.json({ generatedAt: new Date().toISOString(), benchmark: "VN-Index", points: rrgPoints });
  } catch (err) {
    console.error("[api/sector-filter/rrg] Loi:", err);
    return NextResponse.json({ error: "Khong the tinh RRG luc nay." }, { status: 500 });
  }
}