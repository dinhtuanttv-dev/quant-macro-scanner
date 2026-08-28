import { NextResponse } from "next/server";

// MUC 2: Sector Pulse - GIAI DOAN 1 chi thi truong My, dung 11 Sector ETF
// chuan SPDR (thanh khoan cao, ticker on dinh - khac han Iron Ore/Rubber
// da gap van de truoc do). Khong luu Supabase - fetch live moi request,
// vi day la du lieu trong phien, khong phai snapshot 2 lan/ngay.

const US_SECTOR_ETFS: Record<string, string> = {
  XLK: "Công nghệ", XLF: "Tài chính", XLE: "Năng lượng", XLV: "Y tế",
  XLI: "Công nghiệp", XLY: "Tiêu dùng không thiết yếu", XLP: "Tiêu dùng thiết yếu",
  XLB: "Vật liệu", XLU: "Tiện ích", XLRE: "Bất động sản", XLC: "Truyền thông",
};

async function fetchYahooChangePercent(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const price = meta.regularMarketPrice;
    if (!prevClose || !price) return null;
    return ((price - prevClose) / prevClose) * 100;
  } catch {
    return null;
  }
}

export async function GET() {
  const entries = Object.entries(US_SECTOR_ETFS);
  const results = await Promise.all(entries.map(([symbol]) => fetchYahooChangePercent(symbol)));

  const quotes = entries
    .map(([symbol, nameVi], i) => ({
      etfSymbol: symbol, sectorNameVi: nameVi, market: "US",
      changePercent: results[i], fetchedAt: new Date().toISOString(),
    }))
    .filter((q): q is { etfSymbol: string; sectorNameVi: string; market: string; changePercent: number; fetchedAt: string } => q.changePercent !== null);

  if (quotes.length === 0) {
    return NextResponse.json({ error: "Không lấy được dữ liệu Sector ETF từ Yahoo Finance." }, { status: 502 });
  }

  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);

  return NextResponse.json({
    market: "US",
    topGainers: sorted.slice(0, 3),
    topLosers: sorted.slice(-3).reverse(),
    fetchedAt: new Date().toISOString(),
  });
}
