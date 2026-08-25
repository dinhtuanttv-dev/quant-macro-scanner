// VCI Financials Adapter - lay KQKD (income_statement) THEO QUY, mien phi.
// Cung endpoint da xac minh o buoc nang cap TA VN-Index / Loc Nganh truoc do.

const IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";

export interface QuarterlyIncomeRow {
  ticker: string;
  year: number;
  quarter: number;         // 1-4
  revenue: number | null;
  netProfit: number | null;
  periodLabel: string;      // "Q3/2026"
}

export interface QuarterlyFinancialsResult {
  ticker: string;
  available: boolean;
  quarters: QuarterlyIncomeRow[]; // Sap xep tu MOI NHAT den CU NHAT
  error?: string;
}

export async function fetchQuarterlyIncome(ticker: string): Promise<QuarterlyFinancialsResult> {
  try {
    const url = `${IQ_BASE_URL}/v1/company/${ticker}/financial-statement?section=income_statement&period=quarterly`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, available: false, quarters: [], error: `VCI HTTP ${res.status}` };
    }

    const json = await res.json();
    const rawRows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

    // VCI thuong tra ve field dang "revenue", "netProfit"/"profitAfterTax" - du phong nhieu ten field
    const quarters: QuarterlyIncomeRow[] = rawRows
      .map((row) => {
        const year = Number(row.year ?? row.yearReport ?? row.reportYear);
        const quarter = Number(row.quarter ?? row.quarterReport ?? row.lengthReport);
        if (!year || !quarter || quarter < 1 || quarter > 4) return null;

        const revenue = row.revenue ?? row.netRevenue ?? row.totalRevenue ?? null;
        const netProfit = row.netProfit ?? row.profitAfterTax ?? row.netIncome ?? null;

        return {
          ticker, year, quarter,
          revenue: revenue !== null ? Number(revenue) : null,
          netProfit: netProfit !== null ? Number(netProfit) : null,
          periodLabel: `Q${quarter}/${year}`,
        };
      })
      .filter((r): r is QuarterlyIncomeRow => r !== null)
      .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));

    if (quarters.length === 0) {
      return { ticker, available: false, quarters: [], error: "Không parse được dữ liệu quý (có thể VCI đổi field name)" };
    }

    return { ticker, available: true, quarters };
  } catch (err) {
    return { ticker, available: false, quarters: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchQuarterlyIncomeBatch(tickers: string[]): Promise<QuarterlyFinancialsResult[]> {
  const results = await Promise.allSettled(tickers.map((t) => fetchQuarterlyIncome(t)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], available: false, quarters: [], error: "Promise rejected" }
  );
}
