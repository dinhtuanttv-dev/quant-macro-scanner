// VCI Listing Adapter - lay danh sach thanh vien VN30/VN100 thuc
// tu Vietcap (nguon da xac minh qua ma nguon vnstock chinh thuc).
// Day la RO CHI SO CHINH THUC cua HOSE, dang tin cay hon nguong
// Volume/MA50 tu dat, khong can tu tinh toan loc rieng.

export interface FetchResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
}

const TRADING_URL = "https://trading.vietcap.com.vn/api";

/** Lay danh sach ma theo nhom chi so (VN30, VN100...). */
export async function fetchSymbolsByGroup(group: "VN30" | "VN100"): Promise<FetchResult<string[]>> {
  try {
    const url = `${TRADING_URL}/price/symbols/getByGroup?group=${group}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { success: false, data: null, error: `VCI tra ve HTTP ${res.status} cho nhom ${group}` };
    }

    const json = await res.json();
    // API tra ve mang chuoi hoac mang object { symbol: string }, xu ly ca 2 truong hop
    const symbols: string[] = Array.isArray(json)
      ? json.map((item: unknown) => (typeof item === "string" ? item : (item as { symbol?: string })?.symbol)).filter((s): s is string => !!s)
      : [];

    if (symbols.length === 0) {
      return { success: false, data: null, error: `Khong parse duoc danh sach ma tu response VCI (nhom ${group})` };
    }

    return { success: true, data: symbols };
  } catch (err) {
    return { success: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lay universe hop nhat VN30 + VN100 (loai trung), dung cho Pattern Scanner. */
export async function fetchVN30VN100Universe(): Promise<FetchResult<string[]>> {
  const [vn30, vn100] = await Promise.all([fetchSymbolsByGroup("VN30"), fetchSymbolsByGroup("VN100")]);

  if (!vn30.success && !vn100.success) {
    return { success: false, data: null, error: `Ca VN30 va VN100 deu loi: ${vn30.error} | ${vn100.error}` };
  }

  const merged = new Set<string>();
  vn30.data?.forEach((s) => merged.add(s));
  vn100.data?.forEach((s) => merged.add(s));

  return { success: true, data: Array.from(merged) };
}