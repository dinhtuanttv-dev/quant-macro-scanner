import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") ?? "3mo";

  if (!ticker) {
    return NextResponse.json({ error: "Thieu tham so ticker." }, { status: 400 });
  }

  const result = await fetchOhlcvHistory(ticker, range);

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error ?? "Khong lay duoc du lieu OHLCV." },
      { status: 502 }
    );
  }

  const recentBars = result.data.slice(-30);

  return NextResponse.json({ ticker, bars: recentBars });
}