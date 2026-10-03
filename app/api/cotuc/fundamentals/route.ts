import { NextResponse } from "next/server";
import { getCotucUniverse } from "@/lib/cotuc/cotuc-universe";
import { fetchVndFundamentalsBulk } from "@/lib/cotuc/vndirect-fundamentals";

// Chỉ số cơ bản THẬT cho cả danh mục Siêu Quét (~300 mã) từ VNDirect finfo, theo lô (~5 giây).
// Thay nguồn VCI + Yahoo (VCI 403 từ 10/2026 -> 0/17 mã có dữ liệu thật). GIỮ hợp đồng cũ (price, peRatio, roe, debtEquity,
// rsi14, dataQuality) + thêm pbRatio, epsTtm, bvps, dividendYield, beta, latestQuarter.
//   price  = null: giao diện dùng giá khớp trực tiếp SSI (Gateway) — không trả giá trễ ở đây.
//   rsi14  = null: không còn nguồn chuỗi giá theo lô ở route này; giao diện hiện "—" thay vì số mẫu.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export interface StockFundamentals {
  ticker: string;
  price: number | null;
  peRatio: number | null;
  roe: number | null; // %
  debtEquity: number | null;
  rsi14: number | null;
  dataQuality: "HARD_DATA" | "PARTIAL" | "UNAVAILABLE";
  pbRatio: number | null;
  epsTtm: number | null;
  bvps: number | null;
  dividendYield: number | null; // tỷ lệ
  beta: number | null;
  latestQuarter: string | null;
}

export async function GET() {
  try {
    const universe = await getCotucUniverse();
    const { fundamentals: raw, errors } = await fetchVndFundamentalsBulk(universe.tickers.map((t) => t.ticker));
    const fundamentals: StockFundamentals[] = raw.map((f) => {
      const core = [f.peRatio, f.roe, f.debtEquity].filter((v) => v !== null).length;
      return {
        ticker: f.ticker, price: null, peRatio: f.peRatio, roe: f.roe, debtEquity: f.debtEquity, rsi14: null,
        dataQuality: core === 3 ? "HARD_DATA" : core > 0 ? "PARTIAL" : "UNAVAILABLE",
        pbRatio: f.pbRatio, epsTtm: f.epsTtm, bvps: f.bvps, dividendYield: f.dividendYield, beta: f.beta, latestQuarter: f.latestQuarter,
      };
    });
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        source: "VNDIRECT",
        universeSource: universe.source,
        totalRequested: fundamentals.length,
        hardDataCount: fundamentals.filter((f) => f.dataQuality === "HARD_DATA").length,
        errors,
        fundamentals,
      },
      { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200" } },
    );
  } catch (err) {
    console.error("[api/cotuc/fundamentals] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu cơ bản lúc này." }, { status: 500 });
  }
}
