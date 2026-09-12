// VCI Financials Adapter - lay KQKD (income_statement) THEO QUY, mien phi.
//
// FIX QUAN TRONG (2026-09-12) - da xac nhan bang du lieu THAT (goi API
// truc tiep, doi chieu voi bao cao tai chinh cong khai cua VNM):
// 1. Tham so "section" phai la CHU HOA + gach duoi ("INCOME_STATEMENT"),
//    KHONG PHAI "income_statement" (chu thuong) nhu ban truoc - VCI dung
//    Java enum, sai gia tri nay lam TAT CA 17 ma cung fail 1 ly do giong
//    het nhau (da xac nhan qua log that tren Vercel).
// 2. VCI luon tra HTTP 200 KE CA KHI LOI - phai kiem tra field
//    "successful" trong body, KHONG chi dua vao res.ok.
// 3. json.data KHONG PHAI mang - la object { years, quarters }. Phai doc
//    json.data.quarters (mang thuc su can dung), khong phai json.data
//    truc tiep.
// 4. Ten field la MA HOA NOI BO (khong phai "revenue"/"netProfit"):
//    - isa1  = Doanh thu thuan (da doi chieu dung voi VNM Q1/2018: 12,132 ty)
//    - isa22 = Loi nhuan sau thue (da doi chieu dung voi VNM Q1/2018: 2,701 ty)
//    - yearReport = nam, lengthReport = quy (1-4; gia tri 5 = ca nam,
//      CHI xuat hien trong mang "years", khong xuat hien trong "quarters")

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
    const url = `${IQ_BASE_URL}/v1/company/${ticker}/financial-statement?section=INCOME_STATEMENT&period=quarterly`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, available: false, quarters: [], error: `VCI HTTP ${res.status}` };
    }

    const json = await res.json();

    // FIX: VCI tra HTTP 200 KE CA KHI LOI - phai kiem tra rieng field nay.
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Không rõ nguyên nhân";
      return { ticker, available: false, quarters: [], error: `VCI báo lỗi: ${String(reason).slice(0, 150)}` };
    }

    // FIX: json.data la OBJECT { years, quarters }, khong phai mang truc tiep.
    const rawRows: any[] = Array.isArray(json?.data?.quarters) ? json.data.quarters : [];

    const quarters: QuarterlyIncomeRow[] = rawRows
      .map((row) => {
        const year = Number(row.yearReport);
        const quarter = Number(row.lengthReport);
        if (!year || !quarter || quarter < 1 || quarter > 4) return null; // loai bo ban ghi "ca nam" (lengthReport=5) neu lo lan vao

        const revenue = row.isa1 ?? null;
        const netProfit = row.isa22 ?? null;

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
      return { ticker, available: false, quarters: [], error: "VCI trả về thành công nhưng không có dòng quý hợp lệ nào" };
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
