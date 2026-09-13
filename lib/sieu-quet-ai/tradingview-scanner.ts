// TradingView Scanner API - goi TRUC TIEP endpoint cong khai (khong can
// dang nhap) ma thu vien Python "tvscreener"/"tradingview_screener" DUNG
// NGAM BEN DUOI (POST https://scanner.tradingview.com/{market}/scan).
//
// GHI CHU QUAN TRONG: day la API KHONG CHINH THUC (TradingView khong
// cong bo tai lieu chinh thuc cho endpoint nay). Cau truc request/
// response duoi day duoc xac nhan qua nhieu nguon cong dong nhat quan
// (tradingview_screener PyPI, cac thu vien scraper khac), nhung CHUA
// duoc TEST THUC TE voi thi truong Viet Nam cu the boi chinh du an nay.
// Neu TradingView doi cau truc trong tuong lai, chi can sua lai ham
// parse response tuong ung o day.

const SCANNER_URL = "https://scanner.tradingview.com/vietnam/scan";

export interface TvScannerRow {
  ticker: string;      // vd "HOSE:VNM"
  name: string;
  exchange: string;
  sector: string | null;
  close: number | null;
  changePercent: number | null;
  volume: number | null;
  averageVolume30d: number | null;
  marketCap: number | null;
}

// Cac cot yeu cau tu TradingView (thu tu quan trong - response tra ve
// theo DUNG THU TU nay trong mang "d" cua tung dong, KHONG PHAI object
// co ten field).
const COLUMNS = [
  "name", "exchange", "sector", "close", "change", "volume",
  "average_volume_30d_calc", "market_cap_basic",
];

export async function fetchVietnamMarketScan(minVolume = 100_000): Promise<{ success: boolean; data: TvScannerRow[]; error?: string }> {
  try {
    const body = {
      columns: COLUMNS,
      filter: [
        { left: "volume", operation: "greater", right: minVolume },
      ],
      sort: { sortBy: "market_cap_basic", sortOrder: "desc" },
      range: [0, 500], // lay du de loc con lai >=200 sau dieu kien thanh khoan
    };

    const res = await fetch(SCANNER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { success: false, data: [], error: `HTTP ${res.status}: ${await res.text().catch(() => "")}` };
    }

    const json = await res.json();
    const rows = json?.data;
    if (!Array.isArray(rows)) {
      return { success: false, data: [], error: "Response không có mảng 'data' như kỳ vọng - cấu trúc API có thể đã đổi." };
    }

    const parsed: TvScannerRow[] = rows.map((row: { s: string; d: (string | number | null)[] }) => ({
      ticker: row.s,
      name: String(row.d[0] ?? ""),
      exchange: String(row.d[1] ?? ""),
      sector: row.d[2] ? String(row.d[2]) : null,
      close: typeof row.d[3] === "number" ? row.d[3] : null,
      changePercent: typeof row.d[4] === "number" ? row.d[4] : null,
      volume: typeof row.d[5] === "number" ? row.d[5] : null,
      averageVolume30d: typeof row.d[6] === "number" ? row.d[6] : null,
      marketCap: typeof row.d[7] === "number" ? row.d[7] : null,
    }));

    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, data: [], error: err instanceof Error ? err.message : String(err) };
  }
}
