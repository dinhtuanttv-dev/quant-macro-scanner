import * as XLSX from "xlsx";

// Fetcher cho du lieu vi mo TAN SUAT THAP (thang/quy) - KHONG dung chung
// pipeline voi cron 2 lan/ngay (lang phi vo nghia vi du lieu khong doi
// nhanh nhu vay). Nguon: World Bank (Cao su + Phan bon) + BIS (Gia nha the
// gioi), ca 2 deu MIEN PHI, KHONG can API key.

// ============================================================
// CAO SU + PHAN BON (World Bank Pink Sheet - Commodity Price Data)
// ============================================================
//
// FIX (2026-09-10): PHAT HIEN NGUYEN NHAN THAT cua stub cu - URL XLSX
// hardcode truoc day (doc ID "5d903e848db1d1b83e0ec8f744e55570-0350012021",
// tu nam 2021) da het han/khong con duoc World Bank cap nhat, dan den tra
// ve du lieu cu (da xac nhan qua kiem tra thuc te 2026-08-27: du lieu dung
// tai thang 12/2024). World Bank XOAY VONG doc ID theo dot cap nhat (moi
// nam 1 ID moi dang thay), KHONG co URL "latest" co dinh vinh vien.
//
// GIAI PHAP: PHAT HIEN URL DONG - fetch trang chinh thuc
// worldbank.org/en/research/commodity-markets, tim link "Monthly prices...
// (XLS)" bang regex thay vi hardcode URL co the het han. Da xac nhan qua
// nghien cuu thuc te 2026-09-10: trang nay hien tro ve URL thang 9/2026
// con song (doc ID "74e8be41ceb20fa0da750cda2f6b9e4e-0050012026").
const WORLD_BANK_COMMODITY_MARKETS_PAGE = "https://www.worldbank.org/en/research/commodity-markets";

// Fallback cung: neu khong tim thay link tren trang (cau truc trang doi),
// dung URL da xac nhan con song tai thoi diem viet code nay lam phuong an
// du phong - CO THE het han trong tuong lai, uu tien nguon dong o tren.
const FALLBACK_XLSX_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";

async function discoverMonthlyPricesXlsxUrl(): Promise<string | null> {
  try {
    const res = await fetch(WORLD_BANK_COMMODITY_MARKETS_PAGE, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[discoverMonthlyPricesXlsxUrl] Trang worldbank.org tra ve HTTP ${res.status}`);
      return FALLBACK_XLSX_URL;
    }
    const html = await res.text();
    const match = html.match(/https:\/\/thedocs\.worldbank\.org\/[^"'\s]+CMO-Historical-Data-Monthly\.xlsx/i);
    if (match) return match[0];
    console.error("[discoverMonthlyPricesXlsxUrl] Khong tim thay link XLSX tren trang - dung fallback (co the da het han)");
    return FALLBACK_XLSX_URL;
  } catch (err) {
    console.error("[discoverMonthlyPricesXlsxUrl] Loi fetch trang worldbank.org:", err);
    return FALLBACK_XLSX_URL;
  }
}

const SHEET_NAME_CANDIDATES = ["monthly prices", "monthly data", "data"];
const HEADER_SCAN_ROWS = 8; // quet toi da 8 dong dau de tim header (co the header chia nhieu dong: ten + don vi)

interface CommodityWorkbookContext {
  rows: unknown[][];
  headerColumnTexts: string[]; // van ban gop (cac dong header) cho moi cot, dung de fuzzy match
  firstDataRowIndex: number;
}

async function loadCommodityWorkbookContext(): Promise<CommodityWorkbookContext | null> {
  const url = await discoverMonthlyPricesXlsxUrl();
  if (!url) return null;

  let buffer: ArrayBuffer;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[loadCommodityWorkbookContext] Fetch XLSX loi HTTP ${res.status}: ${url}`);
      return null;
    }
    buffer = await res.arrayBuffer();
  } catch (err) {
    console.error("[loadCommodityWorkbookContext] Loi fetch XLSX:", err);
    return null;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    console.error("[loadCommodityWorkbookContext] Loi parse XLSX (file co the khong phai dinh dang xlsx that):", err);
    return null;
  }

  // Tim sheet theo ten fuzzy (khong phan biet hoa/thuong), fallback sheet dau tien
  let sheetName = workbook.SheetNames.find((n) =>
    SHEET_NAME_CANDIDATES.some((candidate) => n.toLowerCase().includes(candidate)),
  );
  if (!sheetName) {
    console.error(
      `[loadCommodityWorkbookContext] Khong tim thay sheet ten khop "Monthly Prices" - cac sheet co san: [${workbook.SheetNames.join(", ")}]. Dung sheet dau tien lam fallback.`,
    );
    sheetName = workbook.SheetNames[0];
  }
  if (!sheetName) {
    console.error("[loadCommodityWorkbookContext] File khong co sheet nao");
    return null;
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  if (rows.length < HEADER_SCAN_ROWS + 1) {
    console.error(`[loadCommodityWorkbookContext] Sheet "${sheetName}" chi co ${rows.length} dong - qua it de la du lieu that`);
    return null;
  }

  // Gop van ban cua N dong dau (co the header chia 2-3 dong: ten hang hoa +
  // don vi) thanh 1 chuoi/cot de fuzzy match khong phu thuoc chinh xac hang nao.
  const columnCount = Math.max(...rows.slice(0, HEADER_SCAN_ROWS).map((r) => r.length));
  const headerColumnTexts: string[] = [];
  for (let col = 0; col < columnCount; col++) {
    let text = "";
    for (let row = 0; row < HEADER_SCAN_ROWS; row++) {
      const cell = rows[row]?.[col];
      if (cell !== undefined && cell !== null) text += " " + String(cell);
    }
    headerColumnTexts.push(text.trim());
  }

  // Dong du lieu dau tien: dong dau tien ma cot 0 trong giong nhan thoi
  // gian (VD "1960M01", so serial ngay, "Jan-1960"...) - heuristic: dong
  // dau tien co it nhat 1 gia tri so o cot sau cot 0.
  let firstDataRowIndex = HEADER_SCAN_ROWS;
  for (let i = HEADER_SCAN_ROWS; i < Math.min(rows.length, HEADER_SCAN_ROWS + 20); i++) {
    const row = rows[i];
    const hasNumericValue = row?.some((c, idx) => idx > 0 && typeof c === "number");
    if (hasNumericValue) {
      firstDataRowIndex = i;
      break;
    }
  }

  return { rows, headerColumnTexts, firstDataRowIndex };
}

function findColumnIndex(headerColumnTexts: string[], pattern: RegExp): number {
  return headerColumnTexts.findIndex((text) => pattern.test(text));
}

function parsePeriodLabel(raw: unknown): string | null {
  if (typeof raw === "string") {
    // Dinh dang "1960M01" (da xac nhan tung thay trong ban PDF lich su cu)
    const m1 = raw.match(/^(\d{4})M(\d{2})$/);
    if (m1) return `${m1[1]}-${m1[2]}`;
    // Dinh dang "2026-01" hoac "2026/01"
    const m2 = raw.match(/^(\d{4})[-/](\d{1,2})$/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}`;
    // Dinh dang "Jan-2026", "Jan-26"
    const m3 = raw.match(/^([A-Za-z]{3})-?(\d{2,4})$/);
    if (m3) {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const mIdx = months.indexOf(m3[1].toLowerCase());
      if (mIdx >= 0) {
        const year = m3[2].length === 2 ? `20${m3[2]}` : m3[2];
        return `${year}-${String(mIdx + 1).padStart(2, "0")}`;
      }
    }
  }
  if (typeof raw === "number") {
    // Excel date serial number (ngay tinh tu 1899-12-30)
    try {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed && parsed.y && parsed.m) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}`;
    } catch {
      // Bo qua, thu cach khac hoac tra ve null ben duoi
    }
  }
  return null;
}

// Trich N diem du lieu gan nhat (cu -> moi) cho 1 cot da xac dinh index.
// KHONG bia du lieu: bo qua gia tri ".." (ky hieu "khong co" cua World
// Bank) hoac khong phai so.
function extractLatestPoints(
  ctx: CommodityWorkbookContext,
  columnIndex: number,
  maxPoints: number,
): { period: string; value: number }[] {
  const points: { period: string; value: number }[] = [];
  for (let i = ctx.rows.length - 1; i >= ctx.firstDataRowIndex; i--) {
    const row = ctx.rows[i];
    const rawValue = row?.[columnIndex];
    const rawPeriod = row?.[0];
    if (typeof rawValue !== "number" || Number.isNaN(rawValue)) continue;
    const period = parsePeriodLabel(rawPeriod);
    if (!period) continue;
    points.push({ period, value: rawValue });
    if (points.length >= maxPoints) break;
  }
  return points.reverse(); // cu -> moi
}

export interface RubberPricePoint {
  month: string; // "2026-08"
  priceUsdKg: number;
}

// Cot "Rubber, RSS3" - da xac nhan ten thuc te qua bao cao Pink Sheet PDF
// chinh thuc thang 3/2025 (nguon: thedocs.worldbank.org, xem ghi chu trong
// PR). Pattern fuzzy chiu duoc bien the nho ve dinh dang (dau phay, khoang
// trang, hoa/thuong).
const RUBBER_COLUMN_PATTERN = /rubber[,\s]*rss.?\s*3/i;

export async function fetchLatestRubberPrice(maxPoints = 6): Promise<RubberPricePoint[] | null> {
  const ctx = await loadCommodityWorkbookContext();
  if (!ctx) return null;

  const colIndex = findColumnIndex(ctx.headerColumnTexts, RUBBER_COLUMN_PATTERN);
  if (colIndex === -1) {
    console.error(
      `[fetchLatestRubberPrice] Khong tim thay cot "Rubber, RSS3" trong header. Header thuc te (${ctx.headerColumnTexts.length} cot):`,
      JSON.stringify(ctx.headerColumnTexts.slice(0, 40)),
    );
    return null;
  }

  const points = extractLatestPoints(ctx, colIndex, maxPoints);
  if (points.length === 0) {
    console.error(`[fetchLatestRubberPrice] Tim thay cot (index ${colIndex}) nhung khong trich duoc diem du lieu hop le nao`);
    return null;
  }

  return points.map((p) => ({ month: p.period, priceUsdKg: p.value }));
}

export interface FertilizerPricePoint {
  month: string;
  ureaUsdMt: number | null;
  dapUsdMt: number | null;
}

// FIX (2026-09-10, xac nhan qua debug tren du lieu THAT): ten cot trong
// file XLSX chi la "Urea" don gian (VD: "Urea  ($/mt)"), KHONG co hau to
// "E. Europe" nhu bao cao PDF tuong thuat (Pink Sheet PDF dung ten mo ta
// dai hon, file du lieu tho XLSX dung ten ngan gon hon - 2 nguon khac quy
// uoc dat ten). Da kiem tra: chi CO DUNG 1 cot chua "urea" trong toan bo
// header - khong co nguy co trung voi cot khac khi noi long pattern.
const UREA_COLUMN_PATTERN = /^\s*urea\b/i;
const DAP_COLUMN_PATTERN = /^\s*dap\b/i;

export async function fetchLatestFertilizerPrices(maxPoints = 6): Promise<FertilizerPricePoint[] | null> {
  const ctx = await loadCommodityWorkbookContext();
  if (!ctx) return null;

  const ureaCol = findColumnIndex(ctx.headerColumnTexts, UREA_COLUMN_PATTERN);
  const dapCol = findColumnIndex(ctx.headerColumnTexts, DAP_COLUMN_PATTERN);

  if (ureaCol === -1 && dapCol === -1) {
    console.error(
      `[fetchLatestFertilizerPrices] Khong tim thay cot Urea lan DAP trong header. Header thuc te (${ctx.headerColumnTexts.length} cot):`,
      JSON.stringify(ctx.headerColumnTexts.slice(0, 40)),
    );
    return null;
  }
  if (ureaCol === -1) console.error('[fetchLatestFertilizerPrices] Khong tim thay cot "Urea, E. Europe" - chi tra ve DAP');
  if (dapCol === -1) console.error('[fetchLatestFertilizerPrices] Khong tim thay cot "DAP" - chi tra ve Urea');

  const ureaPoints = ureaCol >= 0 ? extractLatestPoints(ctx, ureaCol, maxPoints) : [];
  const dapPoints = dapCol >= 0 ? extractLatestPoints(ctx, dapCol, maxPoints) : [];

  const periodSet = new Set([...ureaPoints.map((p) => p.period), ...dapPoints.map((p) => p.period)]);
  const periods = [...periodSet].sort();

  const ureaMap = new Map(ureaPoints.map((p) => [p.period, p.value]));
  const dapMap = new Map(dapPoints.map((p) => [p.period, p.value]));

  const merged = periods.map((period) => ({
    month: period,
    ureaUsdMt: ureaMap.get(period) ?? null,
    dapUsdMt: dapMap.get(period) ?? null,
  }));

  return merged.length > 0 ? merged : null;
}

// ============================================================
// GIA NHA THE GIOI (BIS) - GIU NGUYEN, DA XAC NHAN HOAT DONG 100%
// ============================================================

export interface HousingPriceIndexPoint {
  countryCode: string;
  countryName: string;
  quarter: string;      // "2026-Q1"
  realIndexValue: number;   // Da dieu chinh lam phat, nam goc 2010=100
  yoyChangePercent: number | null;
}

const BIS_HOUSE_PRICE_API_URL = "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_SPP/1.0?format=csv&labels=id";

// Ma UNIT_MEASURE da XAC NHAN THAT qua du lieu that (2026-08-27):
// 628 = muc chi so (Index level), 771 = % thay doi YoY.
// VALUE = "R" (Real, da dieu chinh lam phat) - dung "R" thay vi "N" (Nominal)
// vi so sanh xuyen quoc gia/thoi gian can loai bo yeu to lam phat.
const UNIT_MEASURE_INDEX_LEVEL = "628";
const UNIT_MEASURE_YOY_PERCENT = "771";
const VALUE_TYPE_REAL = "R";

export async function fetchGlobalHousingPrices(countryCodes: string[]): Promise<HousingPriceIndexPoint[]> {
  try {
    const res = await fetch(BIS_HOUSE_PRICE_API_URL, { cache: "no-store" });
    if (!res.ok) return [];

    const csvText = await res.text();
    const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const header = lines[0].split(",");
    const refAreaIdx = header.indexOf("REF_AREA");
    const timeIdx = header.indexOf("TIME_PERIOD");
    const obsValueIdx = header.indexOf("OBS_VALUE");
    const valueIdx = header.indexOf("VALUE");
    const unitMeasureIdx = header.indexOf("UNIT_MEASURE");

    if ([refAreaIdx, timeIdx, obsValueIdx, valueIdx, unitMeasureIdx].includes(-1)) {
      console.error("[fetchGlobalHousingPrices] Thieu cot bat buoc trong CSV that - cau truc BIS co the da doi");
      return [];
    }

    const indexLevelMap = new Map<string, number>();
    const yoyMap = new Map<string, number>();

    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      const countryCode = cols[refAreaIdx]?.replace(/"/g, "");
      if (!countryCode || !countryCodes.includes(countryCode)) continue;
      if (cols[valueIdx]?.replace(/"/g, "") !== VALUE_TYPE_REAL) continue;

      const quarter = cols[timeIdx]?.replace(/"/g, "");
      const obsValue = parseFloat(cols[obsValueIdx]?.replace(/"/g, ""));
      if (isNaN(obsValue)) continue;

      const key = `${countryCode}|${quarter}`;
      const unitMeasure = cols[unitMeasureIdx]?.replace(/"/g, "");
      if (unitMeasure === UNIT_MEASURE_INDEX_LEVEL) indexLevelMap.set(key, obsValue);
      else if (unitMeasure === UNIT_MEASURE_YOY_PERCENT) yoyMap.set(key, obsValue);
    }

    const results: HousingPriceIndexPoint[] = [];
    for (const [key, realIndexValue] of indexLevelMap.entries()) {
      const [countryCode, quarter] = key.split("|");
      results.push({
        countryCode, countryName: countryCode, quarter: quarter,
        realIndexValue, yoyChangePercent: yoyMap.get(key) ?? null,
      });
    }

    const latestPerCountry = new Map<string, HousingPriceIndexPoint>();
    for (const point of results) {
      const existing = latestPerCountry.get(point.countryCode);
      if (!existing || point.quarter > existing.quarter) {
        latestPerCountry.set(point.countryCode, point);
      }
    }

    return Array.from(latestPerCountry.values()).sort((a, b) => b.quarter.localeCompare(a.quarter));
  } catch (err) {
    console.error("[fetchGlobalHousingPrices] Loi fetch BIS:", err);
    return [];
  }
}
