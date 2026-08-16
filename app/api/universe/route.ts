import { NextResponse } from "next/server";
import { fetchVN30VN100Universe } from "@/lib/market-data/vci-listing-adapter";
import { stockUniverse } from "@/lib/quant-data";

const sectorMap: Record<string, string> = {};
stockUniverse.forEach((s) => { sectorMap[s.ticker] = s.sector; });

// Route nhe - chi tra danh sach ma + nganh de tim kiem/them vao Watchlist,
// KHONG goi Yahoo Finance nen tra ve gan nhu tuc thi.
export async function GET() {
  try {
    const universeResult = await fetchVN30VN100Universe();
    const tickers = universeResult.success && universeResult.data
      ? universeResult.data
      : stockUniverse.map((s) => s.ticker);
    const universeSource = universeResult.success ? "VN30_VN100" : "FALLBACK_60";

    const list = tickers.map((ticker) => ({
      ticker,
      sector: sectorMap[ticker] ?? "-",
    }));

    return NextResponse.json({ universeSource, tickers: list });
  } catch (err) {
    console.error("[api/universe] Loi:", err);
    return NextResponse.json({ error: "Khong lay duoc danh sach ma." }, { status: 500 });
  }
}
