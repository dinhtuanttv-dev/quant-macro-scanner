import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { calculateRiskOnIndex } from "@/lib/scoring/weighted-macro-score";

export const maxDuration = 60;

const TICKERS = {
  markets: {
    "^GSPC": "S&P 500 (Mỹ)", "^IXIC": "Nasdaq (Mỹ)", "^DJI": "Dow Jones (Mỹ)",
    "000001.SS": "Shanghai (Trung Quốc)", "^HSI": "Hang Seng (Hồng Kông)",
    "^N225": "Nikkei 225 (Nhật)", "^KS11": "KOSPI (Hàn Quốc)",
    "^GDAXI": "DAX (Đức)", "^FTSE": "FTSE 100 (Anh)", "^STI": "STI (Singapore)",
  },
  macro: { "DX-Y.NYB": "dxy", "^VIX": "vix", "^TNX": "treasury10y", "GC=F": "gold", "BZ=F": "oilBrent", "CL=F": "oilWti" },
};

async function fetchYahooQuote(symbol: string): Promise<{ value: number; changePercent: number } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const value = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const changePercent = prevClose ? ((value - prevClose) / prevClose) * 100 : 0;
    return { value, changePercent };
  } catch {
    return null;
  }
}

async function fetchBDI(): Promise<number | null> {
  const apiKey = process.env.OILPRICEAPI_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.oilpriceapi.com/v1/prices/latest?by_code=BALTIC_DRY_INDEX", {
      headers: { Authorization: `Token ${apiKey}` }, cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.price ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 401 });
  }

  const supabase = createServiceClient();

  const marketEntries = Object.entries(TICKERS.markets);
  const marketResults = await Promise.all(marketEntries.map(([symbol]) => fetchYahooQuote(symbol)));

  const marketRows = marketEntries.map(([symbol, name], i) => ({
    symbol, name, market: name, value: marketResults[i]?.value ?? null,
    change_percent: marketResults[i]?.changePercent ?? null,
  })).filter((r) => r.value !== null);

  if (marketRows.length > 0) await supabase.from("market_pulse").insert(marketRows);

  const macroEntries = Object.entries(TICKERS.macro);
  const macroResults = await Promise.all(macroEntries.map(([symbol]) => fetchYahooQuote(symbol)));
  const macroMap: Record<string, number> = {};
  macroEntries.forEach(([, key], i) => { if (macroResults[i]) macroMap[key] = macroResults[i]!.value; });

  const bdi = await fetchBDI();

  if (macroMap.dxy && macroMap.vix && macroMap.treasury10y) {
    const riskResult = calculateRiskOnIndex({
      dxy: macroMap.dxy, vix: macroMap.vix, treasury10y: macroMap.treasury10y,
    });

    await supabase.from("macro_trends").insert({
      dxy: macroMap.dxy, vix: macroMap.vix, treasury_10y: macroMap.treasury10y,
      gold: macroMap.gold ?? null, oil_brent: macroMap.oilBrent ?? null, oil_wti: macroMap.oilWti ?? null,
      baltic_dry_index: bdi,
      risk_on_score: riskResult.score, risk_status: riskResult.status, breakdown: riskResult.breakdown,
    });

    return NextResponse.json({
      success: true, marketsUpdated: marketRows.length,
      riskOnScore: riskResult.score, riskStatus: riskResult.status,
      bdiAvailable: bdi !== null,
    });
  }

  return NextResponse.json({ success: false, error: "Thiếu dữ liệu DXY/VIX/Treasury để tính Risk-On Index." }, { status: 502 });
}
