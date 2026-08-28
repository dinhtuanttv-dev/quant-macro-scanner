import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { extractCloses } from "@/lib/market-data/technical-indicators";
import { calculateSectorRRG, type RRGPoint } from "@/lib/sector-filter/rrg/rrg-calculator";

export const maxDuration = 10;
const OHLCV_RANGE = "6mo";
const PER_FETCH_TIMEOUT_MS = 6000; // Timeout CUNG cho tung request - khong de 1 ma treo lam sap ca ham

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

// Boc 1 promise voi timeout CUNG - neu qua han, tra ve null thay vi treo mai
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) =>
      setTimeout(() => { console.error(`[rrg] TIMEOUT sau ${ms}ms: ${label}`); resolve(null); }, ms)
    ),
  ]);
}

async function safeFetch(ticker: string, label: string) {
  try {
    console.log(`[rrg] Bat dau fetch: ${label} (${ticker})`);
    const result = await withTimeout(fetchOhlcvHistory(ticker, OHLCV_RANGE), PER_FETCH_TIMEOUT_MS, label);
    console.log(`[rrg] Xong fetch: ${label} - success=${result?.success}`);
    return result;
  } catch (err) {
    console.error(`[rrg] LOI fetch ${label}:`, err);
    return null;
  }
}

export async function GET() {
  console.log("[rrg] ===== BAT DAU XU LY REQUEST =====");
  try {
    const vnResult = await safeFetch("^VNINDEX.VN", "VN-Index benchmark");
    if (!vnResult?.success || !vnResult.data || vnResult.data.length < 63) {
      console.error("[rrg] VN-Index khong du du lieu, dung tai day.");
      return NextResponse.json({ error: "Khong lay du du lieu benchmark VN-Index de tinh RRG." }, { status: 502 });
    }
    const benchmarkCloses = extractCloses(vnResult.data);
    console.log(`[rrg] VN-Index OK, ${benchmarkCloses.length} diem gia.`);

    // Goi TUNG MA rieng le voi timeout, KHONG dung Promise.all tho de tranh
    // 1 ma treo keo ca nhom - Promise.allSettled + withTimeout dam bao luon
    // co ket qua (thanh cong hoac null) cho moi ma trong PER_FETCH_TIMEOUT_MS
    const sectorResults = await Promise.allSettled(
      SECTOR_PROXIES.map((s) => safeFetch(s.proxyTicker, s.sectorLabel))
    );
    console.log(`[rrg] Da nhan ${sectorResults.length} ket qua nganh.`);

    const rrgPoints: RRGPoint[] = [];
    sectorResults.forEach((settled, i) => {
      if (settled.status !== "fulfilled" || !settled.value?.success || !settled.value.data) {
        console.warn(`[rrg] Bo qua nganh ${SECTOR_PROXIES[i].sectorLabel} - khong co du lieu.`);
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

    console.log(`[rrg] ===== HOAN TAT - ${rrgPoints.length} diem RRG =====`);
    return NextResponse.json({ generatedAt: new Date().toISOString(), benchmark: "VN-Index", points: rrgPoints });
  } catch (err) {
    console.error("[rrg] LOI KHONG XAC DINH:", err);
    return NextResponse.json({ error: "Khong the tinh RRG luc nay.", detail: String(err) }, { status: 500 });
  }
}