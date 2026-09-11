import { NextResponse } from "next/server";
import { computeAsiaBasketProxy } from "@/lib/asia-sector-proxy";

// MUC 2: Sector Pulse - GIAI DOAN 1 chi thi truong My, dung 11 Sector ETF
// chuan SPDR (thanh khoan cao, ticker on dinh - khac han Iron Ore/Rubber
// da gap van de truoc do). Khong luu Supabase - fetch live moi request,
// vi day la du lieu trong phien, khong phai snapshot 2 lan/ngay.
//
// FIX (2026-09-10): endpoint truoc day KHONG doc query param "region" -
// goi ?region=eu se AM THAM tra ve du lieu My (frontend da phat hien bug
// nay qua thuc te va tu ve bang isGenuineRegionData()). Gio kiem tra
// nghiem ngat: region khong hop le -> 400 ro rang, KHONG fallback am tham.
//
// MO RONG Chau Au (2026-09-10): dung ho ETF Amundi/Lyxor STOXX Europe 600
// theo tung nganh - CUNG cau truc voi SPDR My. Da xac minh 3/5 ticker qua
// nghien cuu thuc te (Yahoo Finance dinh dang ".PA", niem yet Euronext
// Paris): Nganh hang (BNK.PA), Dau khi (OIL.PA), Vat lieu co ban (BRE.PA).
// Cong nghe va Bat dong san CHUA xac minh duoc ticker dang tin cay trong
// thoi gian nghien cuu - KHONG dua vao de tranh goi sai ticker/gay loi
// fetch. Bo sung sau khi xac nhan qua Yahoo Finance truc tiep.

const US_SECTOR_ETFS: Record<string, string> = {
  XLK: "Công nghệ", XLF: "Tài chính", XLE: "Năng lượng", XLV: "Y tế",
  XLI: "Công nghiệp", XLY: "Tiêu dùng không thiết yếu", XLP: "Tiêu dùng thiết yếu",
  XLB: "Vật liệu", XLU: "Tiện ích", XLRE: "Bất động sản", XLC: "Truyền thông",
};

// STOXX Europe 600 sector ETFs (Amundi/Lyxor, niem yet Euronext Paris).
// Ticker dang ".PA" - dinh dang Yahoo Finance chuan, GIONG cach XLK/XLE
// hoat dong cho My (khong can xu ly rieng trong fetchYahooChangePercent).
const EU_SECTOR_ETFS: Record<string, string> = {
  "BNK.PA": "Ngân hàng",
  "OIL.PA": "Dầu khí",
  "BRE.PA": "Vật liệu cơ bản",
};

// MUC 3 (Chau A, 2026-09-11): KHONG co ETF nganh thong nhat toan khu vuc
// nhu My/Au - dung PHUONG PHAP RO CO PHIEU DAU NGANH (xem lib/asia-sector-
// proxy.ts): trung binh cong + loc outlier z-score, KHONG trong so von
// hoa (Yahoo da khoa endpoint quote/marketCap tu 1/2026). Chi 2/3 rổ da
// xac minh ticker qua nghien cuu thuc te - Nang luong CHUA co ro dai dien
// dang tin cay, KHONG dua vao de tranh bia du lieu.
const ASIA_SECTOR_BASKETS: Record<string, { labelVi: string; tickers: string[] }> = {
  SEMICONDUCTOR_TECH: { labelVi: "Công nghệ / Bán dẫn", tickers: ["2330.TW", "005930.KS", "000660.KS"] },
  BANKING_FINANCE: { labelVi: "Tài chính / Ngân hàng", tickers: ["D05.SI", "HDFCBANK.NS"] },
};

const VALID_REGIONS = ["us", "eu", "asia"] as const;
type Region = (typeof VALID_REGIONS)[number];

const REGION_CONFIG: Record<Exclude<Region, "asia">, { etfs: Record<string, string>; marketLabel: string }> = {
  us: { etfs: US_SECTOR_ETFS, marketLabel: "US" },
  eu: { etfs: EU_SECTOR_ETFS, marketLabel: "EU" },
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionParam = searchParams.get("region") ?? "us";

  // FIX QUAN TRONG: kiem tra nghiem ngat, KHONG fallback am tham ve US
  // khi region la gia tri la. Day chinh la nguyen nhan bug thuc te da
  // gap truoc do (frontend nhan nham du lieu My duoi ten "eu").
  if (!VALID_REGIONS.includes(regionParam as Region)) {
    return NextResponse.json(
      { error: `Tham số region không hợp lệ: "${regionParam}". Chỉ chấp nhận: ${VALID_REGIONS.join(", ")}.` },
      { status: 400 },
    );
  }
  const region = regionParam as Region;

  // Chau A dung co che khac han (ro co phieu + loc outlier, khong phai
  // 1 ETF/nganh) - tach nhanh xu ly rieng, KHONG dung chung REGION_CONFIG.
  if (region === "asia") {
    const entries = Object.entries(ASIA_SECTOR_BASKETS);
    const basketResults = await Promise.all(
      entries.map(([sectorKey, basket]) => computeAsiaBasketProxy(basket.tickers)),
    );

    const quotes = entries
      .map(([sectorKey, basket], i) => ({
        etfSymbol: sectorKey, // dung sectorKey lam dinh danh - frontend resolveAsiaSectorKey doi khop truc tiep sectorKey
        sectorNameVi: basket.labelVi,
        market: "ASIA",
        changePercent: basketResults[i].changePercent,
        fetchedAt: new Date().toISOString(),
      }))
      .filter((q): q is { etfSymbol: string; sectorNameVi: string; market: string; changePercent: number; fetchedAt: string } => q.changePercent !== null);

    if (quotes.length === 0) {
      return NextResponse.json({ error: "Không tính được rổ Châu Á nào (Yahoo Finance lỗi hoặc tất cả mã đều bị loại outlier)." }, { status: 502 });
    }

    const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
    const gainers = sorted.filter((q) => q.changePercent >= 0).slice(0, 3);
    const losers = sorted.filter((q) => q.changePercent < 0).slice(-3).reverse();

    return NextResponse.json({
      market: "ASIA",
      topGainers: gainers,
      topLosers: losers,
      fetchedAt: new Date().toISOString(),
    });
  }

  const { etfs, marketLabel } = REGION_CONFIG[region];

  const entries = Object.entries(etfs);
  const results = await Promise.all(entries.map(([symbol]) => fetchYahooChangePercent(symbol)));

  const quotes = entries
    .map(([symbol, nameVi], i) => ({
      etfSymbol: symbol, sectorNameVi: nameVi, market: marketLabel,
      changePercent: results[i], fetchedAt: new Date().toISOString(),
    }))
    .filter((q): q is { etfSymbol: string; sectorNameVi: string; market: string; changePercent: number; fetchedAt: string } => q.changePercent !== null);

  if (quotes.length === 0) {
    return NextResponse.json({ error: `Không lấy được dữ liệu Sector ETF (${region}) từ Yahoo Finance.` }, { status: 502 });
  }

  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  // FIX: voi EU hien chi co 3 ETF (chua du de chia deu top3/top3 kieu My),
  // slice co dinh theo vi tri se gay trung lap (1 ma vua la "gainer" vua
  // la "loser"). Thay bang loc THEO DAU (>=0 la gainer, <0 la loser) roi
  // moi lay toi da 3 moi ben - dung ngu nghia hon, tu dong dung cho ca
  // truong hop it ETF (EU) lan nhieu ETF (My, 11 ETF) sau nay.
  const gainers = sorted.filter((q) => q.changePercent >= 0).slice(0, 3);
  const losers = sorted.filter((q) => q.changePercent < 0).slice(-3).reverse();

  return NextResponse.json({
    market: marketLabel,
    topGainers: gainers,
    topLosers: losers,
    fetchedAt: new Date().toISOString(),
  });
}
