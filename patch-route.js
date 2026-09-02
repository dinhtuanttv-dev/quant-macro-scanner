const fs = require("fs");
const path = "./app/api/ohlcv/route.ts";

const newContent = `import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";
import { fetchIndexOhlcvHistory } from "@/lib/market-data/ssi-adapter";

export const maxDuration = 10;

const INDEX_TICKERS = new Set(["VNINDEX", "VN-INDEX", "HNXINDEX", "HNX-INDEX"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") ?? "3mo";
  const limit = Number(searchParams.get("limit") ?? "30");

  if (!ticker) {
    return NextResponse.json({ error: "Thieu tham so ticker." }, { status: 400 });
  }

  const normalized = ticker.trim().toUpperCase();
  const isIndex = INDEX_TICKERS.has(normalized);

  const result = isIndex
    ? await fetchIndexOhlcvHistory(normalized.replace("-", ""), 120)
    : await fetchOhlcvHistory(ticker, range);

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Khong lay duoc du lieu OHLCV." },
      { status: 502 }
    );
  }

  const recentBars = result.data.slice(-limit);
  return NextResponse.json({ ticker, bars: recentBars });
}
`;

fs.writeFileSync(path, newContent, "utf8");
console.log("DA VA XONG route.ts");
