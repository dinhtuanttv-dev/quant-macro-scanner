// lib/ingestion/hose/hose-news-fetcher.ts
// Nguon tin CHINH THUC tu So Giao dich Chung khoan TP.HCM (HOSE), qua API
// JSON that (api.hsx.vn) - khong can scrape HTML nhu HNX, khong gap loi SSL.
// catId 1048 = "Diem tin giao dich" - MOI ban tin hang ngay deu nhung san
// bang HTML "3. Su kien doanh nghiep" liet ke cac ma giao dich khong huong
// quyen (ngay chot quyen co tuc that).
import * as cheerio from "cheerio";

const HOSE_NEWS_ENDPOINT = "https://api.hsx.vn/n/api/v1/1/news/cate";
const DAILY_SUMMARY_CAT_ID = 1048;

export interface HoseNewsRecord {
  id: number;
  catId: number;
  title: string;
  postedDate: Date; // tu Unix timestamp
  summaryHtml: string;
}

export interface HoseCorporateEvent {
  ticker: string;
  description: string;
  sourceNewsId: number;
  publishedAt: Date;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchHoseNews(daysBack = 7): Promise<HoseNewsRecord[]> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

  const url = new URL(HOSE_NEWS_ENDPOINT);
  url.searchParams.set("pageIndex", "1");
  url.searchParams.set("pageSize", "30");
  url.searchParams.set("startDate", toDateParam(startDate));
  url.searchParams.set("endDate", toDateParam(endDate));
  url.searchParams.set("aliasCate", "tin-tuc/tin-tuc-hose");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!res.ok) throw new Error(`HOSE tra ve HTTP ${res.status}`);

  const json = await res.json();
  const list = json?.data?.list;
  if (!Array.isArray(list)) throw new Error("HOSE tra ve du lieu khong dung dinh dang");

  return list.map((item: any) => ({
    id: item.id,
    catId: item.catId,
    title: item.title,
    postedDate: new Date(item.postedDate * 1000),
    summaryHtml: item.summary ?? "",
  }));
}

// Trich bang "3. Su kien doanh nghiep" tu HTML nhung trong ban tin hang ngay.
// Dua vao cau truc that da quan sat: sau dong <td colspan="9">3. Su kien
// doanh nghiep</td> la cac dong <tr><td>STT</td><td>Ma CK</td><td colspan="7">Mo ta</td></tr>
export function extractCorporateEvents(record: HoseNewsRecord): HoseCorporateEvent[] {
  if (record.catId !== DAILY_SUMMARY_CAT_ID) return [];

  const $ = cheerio.load(record.summaryHtml);
  const events: HoseCorporateEvent[] = [];

  // Tim dong tieu de "3. Su kien doanh nghiep", roi lay cac dong <tr> sau do
  // (bo qua dong tieu de cot "STT | Ma CK | Su kien").
  let foundHeader = false;
  $("tr").each((_, el) => {
    const rowText = $(el).text().trim();

    if (rowText.includes("Sự kiện doanh nghiệp") || rowText.includes("3. Sự kiện")) {
      foundHeader = true;
      return;
    }
    if (!foundHeader) return;
    if (rowText === "STT Mã CK Sự kiện" || rowText.startsWith("STT")) return;

    const cells = $(el).find("td");
    if (cells.length < 3) return;

    const stt = $(cells[0]).text().trim();
    const ticker = $(cells[1]).text().trim();
    const description = $(cells[2]).text().trim();

    // STT phai la so, ticker phai la 3 chu hoa - loc bo dong rac
    if (!/^\d+$/.test(stt)) return;
    if (!/^[A-Z0-9]{2,5}$/.test(ticker)) return;
    if (!description) return;

    events.push({ ticker, description, sourceNewsId: record.id, publishedAt: record.postedDate });
  });

  return events;
}
