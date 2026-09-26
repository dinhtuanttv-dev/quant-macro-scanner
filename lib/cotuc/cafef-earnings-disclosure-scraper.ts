/**
 * cafef-earnings-disclosure-scraper.ts - lay NGAY CONG BO BCTC THAT
 * (lich su nhieu nam, chinh xac den phut) cho Timing Engine v3 (Giai
 * doan 3, Earnings Engine).
 *
 * LY DO (2026-09-26, quan trong): da ra soat toan bo nguon du lieu
 * hien co trong repo - KHONG noi nao luu ngay cong bo BCTC THUC TE
 * (VCI financials chi co ky bao cao, khong co ngay cong bo; VCI events
 * chi co su kien co tuc; HOSE ingest chi lay 7 ngay gan nhat va cung
 * chi loc co tuc + tin xau). Neu thieu du lieu nay, estimateAnnounceDate()
 * cua Timing Engine v3 SE LUON xuong cap "DEADLINE_ONLY" (chi uoc luong
 * bang han phap ly chung, khong tinh chinh rieng theo tung cong ty).
 *
 * GIAI PHAP: scrape trang "Tin tuc doanh nghiep niem yet" cong khai cua
 * CafeF (da co tien le scraper CafeF khac trong repo -
 * lib/recommendations/cafef-scraper.ts - xac nhan huong nay kha thi),
 * co ngay gio chinh xac den phut, du lich su nhieu nam cho tung ma.
 */

export interface EarningsDisclosureRecord {
  year: number;
  quarter: number; // 1-4
  isParentOnly: boolean; // true = "cong ty me" (rieng le), false = hop nhat
  announceDate: string; // ISO YYYY-MM-DD
}

export interface FetchDisclosureResult {
  ticker: string;
  success: boolean;
  records: EarningsDisclosureRecord[];
  error?: string;
}

const CAFEF_BASE = "https://cafef.vn/du-lieu/tin-doanh-nghiep";

// Nhan dien tieu de kieu "Bao cao tai chinh quy 2/2026 (cong ty me)"
// hoac "Bao cao tai chinh quy 2/2026" - AP DUNG LEN CHUOI DA
// stripDiacritics (khong con dau) nen pattern cung phai KHONG DAU.
const QUARTERLY_TITLE_RE = /bao cao tai chinh quy\s*(\d)\s*\/?\s*(\d{4})/i;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Parse "DD/MM/YYYY HH:MM" (dinh dang CafeF hien thi) sang ISO date. */
function parseCafefDate(dd: string, mm: string, yyyy: string): string | null {
  const d = Number(dd), m = Number(mm), y = Number(yyyy);
  if (!d || !m || !y) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Fetch + parse trang "Tin tuc doanh nghiep niem yet" cua CafeF cho 1
 * ma, tra ve danh sach cac lan cong bo BCTC quy da xac nhan (khong bia
 * - chi lay dong THAT SU khop pattern tieu de "bao cao tai chinh quy").
 */
export async function fetchEarningsDisclosureHistory(ticker: string): Promise<FetchDisclosureResult> {
  try {
    const url = `${CAFEF_BASE}/${encodeURIComponent(ticker)}/event.chn`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, success: false, records: [], error: `CafeF tra ve HTTP ${res.status}` };
    }

    const html = await res.text();

    // Moi dong tin CafeF co dang: "DD/MM/YYYY HH:MM <img.../> <a ...>TIEU DE</a>"
    // Bat CAP (ngay, tieu de) bang 1 regex duyet toan bo HTML - khong
    // phu thuoc cau truc the cha cu the (ben vung hon voi thay doi CSS/
    // class nho cua CafeF). Gioi han 200 ky tu giua ngay va the <a> de
    // "vuot qua" the <img> trung gian ma KHONG nhay qua sang dong khac
    // (da xac nhan qua test: [^<]*? that bai vi <img> co dau "<").
    const lineRe = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,200}?<a[^>]*>([^<]+)<\/a>/g;
    const records: EarningsDisclosureRecord[] = [];
    let match: RegExpExecArray | null;

    while ((match = lineRe.exec(html)) !== null) {
      const [, dd, mm, yyyy, rawTitle] = match;
      const title = stripDiacritics(rawTitle);
      const m2 = QUARTERLY_TITLE_RE.exec(stripDiacritics(rawTitle));
      if (!m2) continue;

      const quarter = Number(m2[1]);
      const year = Number(m2[2]);
      if (quarter < 1 || quarter > 4) continue;

      const announceDate = parseCafefDate(dd, mm, yyyy);
      if (!announceDate) continue;

      records.push({
        year, quarter,
        isParentOnly: title.includes("cong ty me"),
        announceDate,
      });
    }

    if (records.length === 0) {
      return { ticker, success: false, records: [], error: "Khong tim thay dong 'bao cao tai chinh quy' nao tren trang CafeF" };
    }

    return { ticker, success: true, records };
  } catch (err) {
    return { ticker, success: false, records: [], error: err instanceof Error ? err.message : String(err) };
  }
}
