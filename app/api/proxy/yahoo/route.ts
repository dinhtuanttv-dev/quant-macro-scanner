import { NextResponse } from "next/server";
import { fetchQuoteBatch } from "@/lib/market-data/yahoo-finance-adapter";

export const maxDuration = 10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return NextResponse.json({ error: "Thieu tham so symbols." }, { status: 400, headers: CORS_HEADERS });
  }

  const tickers = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (tickers.length === 0) {
    return NextResponse.json({ error: "Danh sach symbols rong." }, { status: 400, headers: CORS_HEADERS });
  }

  const quotes = await fetchQuoteBatch(tickers);
  return NextResponse.json(quotes, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
