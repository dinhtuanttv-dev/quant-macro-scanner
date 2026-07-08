import { NextResponse } from "next/server";
import { fetchOhlcvHistory } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker");
  const range = searchParams.get("range") ?? "3mo";
  const limit = Number(searchParams.get("limit") ?? "30");

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

  // limit mac dinh 30 (dung cho SVG chart tinh cu), nhung Command
  // Center (TVChartManager thuc su) co the yeu cau limit lon hon
  // (vd 200) vi thu vien Lightweight Charts xu ly duoc nhieu nen.
  const recentBars = result.data.slice(-limit);

  return NextResponse.json({ ticker, bars: recentBars });
}