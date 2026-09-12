// VCI Balance Sheet Adapter - lay Bang can doi ke toan THEO QUY tu VCI.
// Dung chung 1 endpoint voi vci-financials-adapter.ts, chi khac
// section=BALANCE_SHEET. Da xac nhan bang du lieu THAT (goi API truc
// tiep, doi chieu dung nguyen tac ke toan kep):
//   bsa53 = Tong tai san
//   bsa54 = Tong no phai tra
//   bsa78 = Von chu so huu
//   Kiem chung: bsa53 - bsa54 = bsa78 (dung tuyet doi voi du lieu VNM
//   Q1/2018: 35,328,719,216,070 - 9,037,780,154,701 = 26,290,939,061,369)
//
// LUU Y: bsa54 la TONG NO PHAI TRA (bao gom ca khoan phai tra nguoi ban,
// thue...), KHONG PHAI rieng "no vay co lai" - dung lam PROXY cho ty le
// No/Von chu so huu (D/E ratio pho bien trong phan tich tai chinh van
// thuong dung Tong no phai tra, khong chi rieng no vay).

const IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";

export interface QuarterlyBalanceRow {
  ticker: string;
  year: number;
  quarter: number;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  periodLabel: string;
}

export interface QuarterlyBalanceSheetResult {
  ticker: string;
  available: boolean;
  quarters: QuarterlyBalanceRow[]; // Sap xep tu MOI NHAT den CU NHAT
  error?: string;
}

export async function fetchQuarterlyBalance(ticker: string): Promise<QuarterlyBalanceSheetResult> {
  try {
    const url = `${IQ_BASE_URL}/v1/company/${ticker}/financial-statement?section=BALANCE_SHEET&period=quarterly`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, available: false, quarters: [], error: `VCI HTTP ${res.status}` };
    }

    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Không rõ nguyên nhân";
      return { ticker, available: false, quarters: [], error: `VCI báo lỗi: ${String(reason).slice(0, 150)}` };
    }

    const rawRows: any[] = Array.isArray(json?.data?.quarters) ? json.data.quarters : [];

    const quarters: QuarterlyBalanceRow[] = rawRows
      .map((row) => {
        const year = Number(row.yearReport);
        const quarter = Number(row.lengthReport);
        if (!year || !quarter || quarter < 1 || quarter > 4) return null;

        const totalAssets = row.bsa53 ?? null;
        const totalLiabilities = row.bsa54 ?? null;
        const totalEquity = row.bsa78 ?? null;

        return {
          ticker, year, quarter,
          totalAssets: totalAssets !== null ? Number(totalAssets) : null,
          totalLiabilities: totalLiabilities !== null ? Number(totalLiabilities) : null,
          totalEquity: totalEquity !== null ? Number(totalEquity) : null,
          periodLabel: `Q${quarter}/${year}`,
        };
      })
      .filter((r): r is QuarterlyBalanceRow => r !== null)
      .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter));

    if (quarters.length === 0) {
      return { ticker, available: false, quarters: [], error: "VCI trả về thành công nhưng không có dòng quý hợp lệ nào" };
    }

    return { ticker, available: true, quarters };
  } catch (err) {
    return { ticker, available: false, quarters: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchQuarterlyBalanceBatch(tickers: string[]): Promise<QuarterlyBalanceSheetResult[]> {
  const results = await Promise.allSettled(tickers.map((t) => fetchQuarterlyBalance(t)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], available: false, quarters: [], error: "Promise rejected" }
  );
}
