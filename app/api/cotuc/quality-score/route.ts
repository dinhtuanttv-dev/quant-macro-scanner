import { NextResponse } from "next/server";
import { fetchQuarterlyIncomeBatch } from "@/lib/cotuc/vci-financials-adapter";
import { fetchQuarterlyBalanceBatch } from "@/lib/cotuc/vci-balance-sheet-adapter";
import { fetchDividendEventsBatch } from "@/lib/cotuc/vci-events-adapter";
import { buildLifecycleEvents } from "@/lib/cotuc/dividend-lifecycle";
import { fetchQuoteBatch } from "@/lib/market-data/yahoo-finance-adapter";
import { calculateEarningsGrowth } from "@/lib/cotuc/earnings-scoring";
import {
  calculateTier1Score, calculateTier2Score, calculateTier3Score,
  calculateConsecutiveYears, calculateMedian, detectDividendRedFlag,
} from "@/lib/cotuc/dividend-quality-score";
import { DIVIDEND_STOCKS } from "@/lib/quant-cotuc";

// P2: Dividend Quality Score - Tang 1-3 (Tang 4 tinh o frontend vi RS
// da co san client-side, xem ghi chu trong dividend-quality-score.ts).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const tickers = DIVIDEND_STOCKS.map((s) => s.ticker);
  const sectorByTicker = new Map(DIVIDEND_STOCKS.map((s) => [s.ticker, s.sector]));

  try {
    const [incomeResults, balanceResults, eventsResults, quotes] = await Promise.all([
      fetchQuarterlyIncomeBatch(tickers),
      fetchQuarterlyBalanceBatch(tickers),
      fetchDividendEventsBatch(tickers),
      fetchQuoteBatch(tickers),
    ]);

    const incomeMap = new Map(incomeResults.map((r) => [r.ticker, r]));
    const balanceMap = new Map(balanceResults.map((r) => [r.ticker, r]));
    const eventsMap = new Map(eventsResults.map((r) => [r.ticker, r]));

    // Buoc 1: tinh cac gia tri THO (debtEquity, pe) cho TAT CA 17 ma
    // TRUOC, de co du lieu tinh TRUNG VI NGANH (can tat ca ma cung nganh).
    type RawMetrics = {
      ticker: string; sector: string;
      debtEquity: number | null; pe: number | null;
      payoutRatioPct: number | null; consecutiveYears: number | null;
      earningsScore: number | null; hasRedFlag: boolean;
      dividendYieldPct: number | null;
    };

    const rawByTicker: RawMetrics[] = tickers.map((ticker) => {
      const sector = sectorByTicker.get(ticker) ?? "Khac";
      const income = incomeMap.get(ticker);
      const balance = balanceMap.get(ticker);
      const events = eventsMap.get(ticker);
      const quote = quotes[ticker];

      const last4 = income?.available ? income.quarters.slice(0, 4) : [];
      const hasFull4 = last4.length === 4;
      const epsTTM = hasFull4 ? last4.reduce((s, q) => s + (q.eps ?? 0), 0) : null;
      const netProfitTTM = hasFull4 ? last4.reduce((s, q) => s + (q.netProfit ?? 0), 0) : null;

      const latestBalance = balance?.available ? balance.quarters[0] : null;
      const totalEquity = latestBalance?.totalEquity ?? null;
      const totalLiabilities = latestBalance?.totalLiabilities ?? null;
      const debtEquity = totalLiabilities !== null && totalEquity ? totalLiabilities / totalEquity : null;

      const price = quote?.price ?? null;
      const pe = price !== null && epsTTM !== null && epsTTM > 0 ? price / epsTTM : null;

      const lifecycle = events?.available ? buildLifecycleEvents(ticker, events.rawEvents) : [];
      const cashEvents = lifecycle.filter((e) => e.eventType === "CASH");
      const latestCash = cashEvents[0] ?? null;
      const previousCash = cashEvents[1] ?? null;

      // Payout ratio = DPS gan nhat / EPS TTM (theo dung cong thuc chuan)
      const payoutRatioPct = latestCash?.valuePerShare !== null && latestCash?.valuePerShare !== undefined && epsTTM && epsTTM > 0
        ? (latestCash.valuePerShare / epsTTM) * 100
        : null;

      const consecutiveYears = cashEvents.length > 0 ? calculateConsecutiveYears(lifecycle) : null;

      // Growth score (Tang 2) - tai su dung ham da co san tu P0
      const growthResult = income?.available ? calculateEarningsGrowth(ticker, income.quarters) : null;
      const earningsScore = growthResult?.earningsScore ?? null;
      const hasRedFlag = detectDividendRedFlag(
        growthResult?.profitGrowthYoY ?? null,
        latestCash?.valuePerShare ?? null,
        previousCash?.valuePerShare ?? null
      );

      // Dividend yield = DPS gan nhat (annualized don gian: chinh no,
      // khong nhan doi - vi da la 1 dot cu the) / gia hien tai
      const dividendYieldPct = latestCash?.valuePerShare && price ? (latestCash.valuePerShare / price) * 100 : null;

      return { ticker, sector, debtEquity, pe, payoutRatioPct, consecutiveYears, earningsScore, hasRedFlag, dividendYieldPct };
    });

    // Buoc 2: tinh TRUNG VI theo NGANH (tu 17 ma) cho debtEquity va pe.
    // FIX QUAN TRONG: voi danh sach 17 ma co dinh hien tai, 10/17 ma la
    // "DUY NHAT" trong nganh cua no (VD BMP - Vat lieu XD chi co 1 ma) -
    // "trung vi nganh" cua cac ma nay se LUON BANG CHINH NO (vo nghia,
    // luon cho 100 diem). FALLBACK: neu nganh chi co <2 ma, dung trung
    // vi TOAN BO 17 MA (toan thi truong) thay the, danh dau ro trong
    // details de biet day la so sanh "toan thi truong", khong phai
    // "cung nganh".
    const allDebtEquities = rawByTicker.map((r) => r.debtEquity);
    const allPe = rawByTicker.map((r) => r.pe);
    const marketMedianDebtEquity = calculateMedian(allDebtEquities);
    const marketMedianPe = calculateMedian(allPe);

    const sectorGroups = new Map<string, RawMetrics[]>();
    rawByTicker.forEach((r) => {
      const list = sectorGroups.get(r.sector) ?? [];
      list.push(r);
      sectorGroups.set(r.sector, list);
    });
    const industryMedianDebtEquity = new Map<string, number | null>();
    const industryMedianPe = new Map<string, number | null>();
    const usedMarketWideFallback = new Map<string, boolean>();
    sectorGroups.forEach((list, sector) => {
      const hasEnoughInSector = list.length >= 2;
      industryMedianDebtEquity.set(sector, hasEnoughInSector ? calculateMedian(list.map((r) => r.debtEquity)) : marketMedianDebtEquity);
      industryMedianPe.set(sector, hasEnoughInSector ? calculateMedian(list.map((r) => r.pe)) : marketMedianPe);
      usedMarketWideFallback.set(sector, !hasEnoughInSector);
    });

    // Buoc 3: tinh diem Tang 1-3 cho tung ma
    const results = rawByTicker.map((r) => {
      const tier1 = calculateTier1Score({
        payoutRatioPct: r.payoutRatioPct,
        consecutiveYears: r.consecutiveYears,
        debtEquity: r.debtEquity,
        industryMedianDebtEquity: industryMedianDebtEquity.get(r.sector) ?? null,
      });
      const tier2 = calculateTier2Score({ earningsScore: r.earningsScore, hasRedFlag: r.hasRedFlag });
      const tier3 = calculateTier3Score({
        pe: r.pe,
        industryMedianPe: industryMedianPe.get(r.sector) ?? null,
        dividendYieldPct: r.dividendYieldPct,
      });

      return {
        ticker: r.ticker, sector: r.sector,
        tier1, tier2, tier3,
        details: {
          payoutRatioPct: r.payoutRatioPct,
          consecutiveYears: r.consecutiveYears,
          debtEquity: r.debtEquity,
          industryMedianDebtEquity: industryMedianDebtEquity.get(r.sector) ?? null,
          pe: r.pe,
          industryMedianPe: industryMedianPe.get(r.sector) ?? null,
          dividendYieldPct: r.dividendYieldPct,
          hasRedFlag: r.hasRedFlag,
          usedMarketWideMedianFallback: usedMarketWideFallback.get(r.sector) ?? false,
        },
      };
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      note: "Tang 4 (RS 3 thang + Red Flag) tinh o frontend - da co san client-side. Ket hop voi tier1/tier2/tier3 o day theo trong so 30/30/25/15 de ra Dividend Quality Score cuoi cung.",
      results,
    });
  } catch (err) {
    console.error("[api/cotuc/quality-score] Lỗi:", err);
    return NextResponse.json({ error: "Không thể tính Dividend Quality Score lúc này." }, { status: 500 });
  }
}
