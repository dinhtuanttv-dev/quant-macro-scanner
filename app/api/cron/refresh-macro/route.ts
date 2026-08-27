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
  // PHASE 1 mo rong hang hoa (2026-08-26): Quang sat/Cao su KHONG co
  // ticker Yahoo Finance dang tin cay (da xac nhan qua tim kiem that -
  // TIO=F/TIOM15.NYM tra ve "Futures data is currently not available").
  // Giai phap thay the:
  // - Ca phe Robusta: dung truc tiep chi so that ^NQCIRMER (co du lieu that)
  // - Quang sat: dung PROXY qua 3 co phieu khai khoang lon nhat the gioi
  //   (RIO/VALE/BHP), % thay doi trung binh phan anh xu huong gia quang sat
  //   gian tiep nhung dang tin cay hon han ticker hang hoa truc tiep bi loi.
  // Cao su: CHUA co trong Phase 1 - can co che rieng (World Bank monthly
  // data), xem PHASE2-TODO.md se lam sau, KHONG bia du lieu.
  commodityRobusta: { "^NQCIRMER": "robustaCoffee" },
  ironOreProxy: { "RIO": "Rio Tinto", "VALE": "Vale", "BHP": "BHP" },
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

  // FIX (2026-08-26): ban truoc khong kiem tra error tra ve tu .insert() -
  // Supabase JS KHONG throw khi insert that bai (VD bang khong ton tai,
  // schema cache stale nhu vua gap - PGRST205), chi tra { error: {...} }.
  // Code cu se van chay tiep binh thuong va bao "success":true dieu nay
  // sai hoan toan thuc te (khong co dong nao duoc ghi). Gio kiem tra ro.
  let marketInsertError: string | null = null;
  if (marketRows.length > 0) {
    const { error } = await supabase.from("world_market_pulse").insert(marketRows);
    if (error) {
      console.error("[cron/refresh-macro] Loi insert market_pulse:", error);
      marketInsertError = error.message;
    }
  }

  const macroEntries = Object.entries(TICKERS.macro);
  const macroResults = await Promise.all(macroEntries.map(([symbol]) => fetchYahooQuote(symbol)));
  const macroMap: Record<string, number> = {};
  macroEntries.forEach(([, key], i) => { if (macroResults[i]) macroMap[key] = macroResults[i]!.value; });

  const bdi = await fetchBDI();

  // PHASE 1 mo rong (2026-08-26): Ca phe Robusta that + Iron Ore proxy
  const robustaEntries = Object.entries(TICKERS.commodityRobusta);
  const robustaResults = await Promise.all(robustaEntries.map(([symbol]) => fetchYahooQuote(symbol)));
  const robustaCoffee = robustaResults[0]?.value ?? null;

  const ironOreEntries = Object.entries(TICKERS.ironOreProxy);
  const ironOreResults = await Promise.all(ironOreEntries.map(([symbol]) => fetchYahooQuote(symbol)));
  const validIronOreChanges = ironOreResults.filter((r): r is { value: number; changePercent: number } => r !== null).map((r) => r.changePercent);
  // Proxy: % thay doi TRUNG BINH cua 3 co phieu khai khoang lon nhat -
  // KHONG phai gia quang sat that, chi la tin hieu xu huong gian tiep.
  // Neu khong lay duoc du lieu nao ca 3 ma -> null, khong bia so 0.
  const ironOreProxyChangePercent = validIronOreChanges.length > 0
    ? Math.round((validIronOreChanges.reduce((a, b) => a + b, 0) / validIronOreChanges.length) * 100) / 100
    : null;

  if (macroMap.dxy && macroMap.vix && macroMap.treasury10y) {
    const riskResult = calculateRiskOnIndex({
      dxy: macroMap.dxy, vix: macroMap.vix, treasury10y: macroMap.treasury10y,
    });

    const { error: macroInsertError } = await supabase.from("world_macro_trends").insert({
      dxy: macroMap.dxy, vix: macroMap.vix, treasury_10y: macroMap.treasury10y,
      gold: macroMap.gold ?? null, oil_brent: macroMap.oilBrent ?? null, oil_wti: macroMap.oilWti ?? null,
      baltic_dry_index: bdi,
      robusta_coffee: robustaCoffee, iron_ore_proxy_change_percent: ironOreProxyChangePercent,
      risk_on_score: riskResult.score, risk_status: riskResult.status, breakdown: riskResult.breakdown,
    });

    if (macroInsertError) {
      console.error("[cron/refresh-macro] Loi insert macro_trends:", macroInsertError);
      return NextResponse.json(
        { success: false, error: `Lỗi ghi macro_trends: ${macroInsertError.message}`, marketInsertError },
        { status: 502 }
      );
    }

    // success:true GIO CHI tra ve khi ca 2 insert thuc su thanh cong (hoac
    // market_pulse rong tu dau, khong phai bi loi am tham).
    return NextResponse.json({
      success: true, marketsUpdated: marketInsertError ? 0 : marketRows.length,
      marketInsertError,
      riskOnScore: riskResult.score, riskStatus: riskResult.status,
      bdiAvailable: bdi !== null,
    });
  }

  return NextResponse.json({ success: false, error: "Thiếu dữ liệu DXY/VIX/Treasury để tính Risk-On Index." }, { status: 502 });
}
