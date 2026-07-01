import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;

// Danh sach chi so the gioi va hang hoa co the lay tu Yahoo Finance
// (endpoint v8/finance/chart da verify hoat dong)
const WORLD_SYMBOLS = [
  // Chi so chung khoan the gioi
  { key: "DJI", symbol: "^DJI", label: "Dow Jones", type: "index", country: "My" },
  { key: "SP500", symbol: "^GSPC", label: "S&P 500", type: "index", country: "My" },
  { key: "NASDAQ", symbol: "^IXIC", label: "Nasdaq", type: "index", country: "My" },
  { key: "NIKKEI", symbol: "^N225", label: "Nikkei 225", type: "index", country: "Nhat Ban" },
  { key: "HSI", symbol: "^HSI", label: "Hang Seng", type: "index", country: "Hong Kong" },
  { key: "SSE", symbol: "000001.SS", label: "Shanghai", type: "index", country: "Trung Quoc" },
  { key: "DAX", symbol: "^GDAXI", label: "DAX", type: "index", country: "Duc" },
  // Hang hoa
  { key: "OIL", symbol: "BZ=F", label: "Dau Brent", type: "commodity", unit: "USD/thung" },
  { key: "GOLD", symbol: "GC=F", label: "Vang", type: "commodity", unit: "USD/oz" },
  { key: "DXY", symbol: "DX-Y.NYB", label: "DXY", type: "fx", unit: "diem" },
  { key: "USDJPY", symbol: "JPY=X", label: "USD/JPY", type: "fx", unit: "JPY" },
];

export interface WorldDataItem {
  key: string;
  label: string;
  type: string;
  country?: string;
  unit?: string;
  latestClose: number | null;
  prevClose: number | null;
  changePct: number | null;
  trend: "Up" | "Down" | "Neutral";
  error?: string;
}

export interface WorldDataResponse {
  generatedAt: string;
  items: WorldDataItem[];
}

export async function GET() {
  // Goi song song tat ca (it symbol, moi symbol lay 5d nen rat nhanh)
  const results = await Promise.all(
    WORLD_SYMBOLS.map(async (sym) => {
      const res = await fetchOhlcvHistory(sym.symbol, "5d");
      if (!res.success || !res.data || res.data.length < 2) {
        return {
          key: sym.key,
          label: sym.label,
          type: sym.type,
          country: sym.country,
          unit: sym.unit,
          latestClose: res.data?.[res.data.length - 1]?.close ?? null,
          prevClose: null,
          changePct: null,
          trend: "Neutral" as const,
          error: res.error,
        };
      }
      const bars = res.data;
      const latestClose = bars[bars.length - 1].close;
      const prevClose = bars[bars.length - 2].close;
      const changePct = prevClose ? Math.round(((latestClose - prevClose) / prevClose) * 1000) / 10 : null;
      const trend: "Up" | "Down" | "Neutral" =
        changePct === null ? "Neutral" : changePct > 0 ? "Up" : changePct < 0 ? "Down" : "Neutral";

      return {
        key: sym.key,
        label: sym.label,
        type: sym.type,
        country: sym.country,
        unit: sym.unit,
        latestClose,
        prevClose,
        changePct,
        trend,
      };
    })
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    items: results,
  } as WorldDataResponse);
}