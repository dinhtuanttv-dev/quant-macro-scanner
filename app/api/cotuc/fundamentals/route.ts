import { NextResponse } from "next/server";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { fetchQuarterlyBalanceBatch } from "@/lib/cotuc/vci-balance-sheet-adapter";
import { fetchOhlcvHistory, fetchQuoteBatch } from "@/lib/market-data/yahoo-finance-adapter";
import { calculateRSI, extractCloses } from "@/lib/market-data/technical-indicators";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// P0 (2026-09-12): thay du lieu mau tinh cua Bo Loc chinh bang du lieu
// THAT - P/E, ROE, No/Von chu so huu (tu VCI, da xac nhan dung field qua
// debug API that), RSI (tu Yahoo Finance, cong thuc Wilder da test dung
// bo du lieu kinh dien). 17 ma x 3 nguon du lieu song song - can thoi
// gian du (60s) hon route KQKD don gian.
export const maxDuration = 60;

export interface StockFundamentals {
  ticker: string;
  price: number | null;
  peRatio: number | null;
  roe: number | null;      // %
  debtEquity: number | null;
  rsi14: number | null;
  dataQuality: "HARD_DATA" | "PARTIAL" | "UNAVAILABLE";
}

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);

  try {
    const [incomeResults, balanceResults, quotes] = await Promise.all([
      fetchQuarterlyIncomeBatch(tickers),
      fetchQuarterlyBalanceBatch(tickers),
      fetchQuoteBatch(tickers),
    ]);

    // RSI can chuoi gia lich su rieng (fetchOhlcvHistory tung ma) - goi
    // song song, KHONG tuan tu, tranh cham nhu cac route khac da gap.
    const ohlcvResults = await Promise.allSettled(
      tickers.map((t) => fetchOhlcvHistory(t, "2mo"))
    );

    const incomeMap = new Map(incomeResults.map((r) => [r.ticker, r]));
    const balanceMap = new Map(balanceResults.map((r) => [r.ticker, r]));

    const fundamentals: StockFundamentals[] = tickers.map((ticker, i) => {
      const income = incomeMap.get(ticker);
      const balance = balanceMap.get(ticker);
      const quote = quotes[ticker];
      const ohlcvRes = ohlcvResults[i];

      const price = quote?.price ?? null;

      // LNST TTM + EPS TTM = tong 4 quy gan nhat (neu du du lieu)
      const last4 = income?.available ? income.quarters.slice(0, 4) : [];
      const hasFull4Quarters = last4.length === 4;
      const netProfitTTM = hasFull4Quarters ? last4.reduce((s, q) => s + (q.netProfit ?? 0), 0) : null;
      const epsTTM = hasFull4Quarters ? last4.reduce((s, q) => s + (q.eps ?? 0), 0) : null;

      const latestBalance = balance?.available ? balance.quarters[0] : null;
      const totalEquity = latestBalance?.totalEquity ?? null;
      const totalLiabilities = latestBalance?.totalLiabilities ?? null;

      const roe = netProfitTTM !== null && totalEquity ? (netProfitTTM / totalEquity) * 100 : null;
      const debtEquity = totalLiabilities !== null && totalEquity ? totalLiabilities / totalEquity : null;
      // P/E khong tinh duoc neu EPS <= 0 (loi hoac am) - tranh P/E am gay hieu lam
      const peRatio = price !== null && epsTTM !== null && epsTTM > 0 ? price / epsTTM : null;

      let rsi14: number | null = null;
      if (ohlcvRes.status === "fulfilled" && ohlcvRes.value.success && ohlcvRes.value.data) {
        const closes = extractCloses(ohlcvRes.value.data);
        rsi14 = calculateRSI(closes, 14);
      }

      const fieldsAvailable = [price, peRatio, roe, debtEquity, rsi14].filter((v) => v !== null).length;
      const dataQuality: StockFundamentals["dataQuality"] =
        fieldsAvailable === 5 ? "HARD_DATA" : fieldsAvailable > 0 ? "PARTIAL" : "UNAVAILABLE";

      return { ticker, price, peRatio, roe, debtEquity, rsi14, dataQuality };
    });

    const hardDataCount = fundamentals.filter((f) => f.dataQuality === "HARD_DATA").length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRequested: tickers.length,
      hardDataCount,
      fundamentals,
    });
  } catch (err) {
    console.error("[api/cotuc/fundamentals] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tải dữ liệu cơ bản lúc này." }, { status: 500 });
  }
}
