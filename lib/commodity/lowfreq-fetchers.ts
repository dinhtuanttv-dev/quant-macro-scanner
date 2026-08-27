// Fetcher cho du lieu vi mo TAN SUAT THAP (thang/quy) - KHONG dung chung
// pipeline voi cron 2 lan/ngay (lang phi vo nghia vi du lieu khong doi
// nhanh nhu vay). Nguon: World Bank (Cao su) + BIS (Gia nha the gioi),
// ca 2 deu MIEN PHI, KHONG can API key, da xac nhan qua tim kiem thuc te
// 2026-08-26.

export interface RubberPricePoint {
  month: string;      // "2026-07"
  priceUsdKg: number;
}

// World Bank "Pink Sheet" - Commodity Price Data, CSV cong khai, cap nhat
// hang thang. Cot "Rubber, Singapore" theo don vi US cent/kg trong file goc.
const WORLD_BANK_PINK_SHEET_URL = "https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx";

export async function fetchLatestRubberPrice(): Promise<RubberPricePoint | null> {
  try {
    // LUU Y QUAN TRONG: file goc la .xlsx (Excel), KHONG phai CSV/JSON -
    // can thu vien parse excel (VD "xlsx" package) de doc that. Ham nay
    // hien tra ve null co chu dich - CHUA THE lay du lieu that cho toi khi
    // co thu vien parse + xac nhan dung ten sheet/cot qua kiem tra thuc te
    // tren file that (KHONG doan ten cot/sheet ma khong xem file that).
    console.warn("[fetchLatestRubberPrice] CHUA TRIEN KHAI DAY DU - can npm install xlsx + xac nhan cau truc file that truoc");
    return null;
  } catch {
    return null;
  }
}

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

    // Gom theo quoc gia+quy: can CA 2 dong (628=index, 771=YoY%) cho cung
    // 1 quoc gia+quy de ghep thanh 1 ban ghi HousingPriceIndexPoint.
    const indexLevelMap = new Map<string, number>();   // key: `${country}|${quarter}`
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

    // FIX (2026-08-27): BUG THAT tim thay qua test - ban truoc tra ve TOAN
    // BO lich su (~1800+ dong cho 9 quoc gia) thay vi CHI quy moi nhat/quoc
    // gia. Moi lan cron chay se ghi trung lap hang nghin dong vo ich. Gio
    // group theo quoc gia, CHI giu 1 dong MOI NHAT (quarter lon nhat) moi
    // quoc gia truoc khi tra ve.
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
