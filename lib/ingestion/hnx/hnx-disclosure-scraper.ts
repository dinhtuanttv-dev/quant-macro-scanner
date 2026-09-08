// lib/ingestion/hnx/hnx-disclosure-scraper.ts
// Nguon tin cong bo CHINH THUC tu So Giao dich Chung khoan Ha Noi (HNX) -
// muc "Tin tu To chuc phat hanh chua giao dich" (UpCoM). Day la cong bo
// thong tin THAT tu chinh So, do tin cay cao nhat trong toan he thong.
// Dung POST form-urlencoded, response la HTML fragment (khong phai JSON).
//
// GHI CHU QUAN TRONG VE SSL: hnx.vn dung chuoi chung chi ma Node.js runtime
// (ca local lan Vercel) khong xac minh duoc day du - da xac nhan qua log
// loi that: UNABLE_TO_VERIFY_LEAF_SIGNATURE. Day la van de PHIA HNX (thieu
// chuoi CA trung gian chuan), khong phai loi code. Giai phap: dung 1
// https.Agent RIENG chi noi long kiem tra SSL cho DUNG request nay - KHONG
// dung bien moi truong NODE_TLS_REJECT_UNAUTHORIZED toan cuc (se lam mat
// an toan moi request HTTPS khac trong he thong).
import * as cheerio from "cheerio";
import https from "https";

const HNX_ENDPOINT = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinTCPHChuaGD_UpCoM";
const REFERER = "https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html";

const hnxAgent = new https.Agent({ rejectUnauthorized: false });

export interface HnxDisclosureRecord {
  originRecordId: string;
  title: string;
  publishedAt: Date;
  tickerGuess: string | null;
}

function extractTicker(title: string): string | null {
  const match = title.match(/MCK:\s*([A-Z0-9]{2,10})/i);
  return match ? match[1].toUpperCase() : null;
}

function parseVnDate(raw: string): Date | null {
  const match = raw.trim().match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
}

export async function fetchHnxDisclosures(numRecord = 30): Promise<HnxDisclosureRecord[]> {
  const body = new URLSearchParams({
    pNumPage: "1", pTieuDeTin: "", pFromDate: "", pToDate: "", pNumRecord: String(numRecord),
  });

  const res = await fetch(HNX_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: REFERER,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: body.toString(),
    // @ts-expect-error - "agent" khong nam trong type chuan cua fetch() nhung Node.js runtime ho tro that
    agent: hnxAgent,
  });

  if (!res.ok) throw new Error(`HNX tra ve HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const records: HnxDisclosureRecord[] = [];

  $("table#_tableDatas tbody tr").each((_, el) => {
    const row = $(el);
    const dateText = row.find("td.tdCenterAlign").eq(0).text().trim();
    const linkEl = row.find("a.hrefViewDetail");
    const title = linkEl.text().trim().replace(/\s+/g, " ");
    const onclick = linkEl.attr("onclick") ?? "";
    const idMatch = onclick.match(/funcViewDetailArticlesByID\((\d+)/);

    if (!title || !idMatch) return;

    const publishedAt = parseVnDate(dateText);
    if (!publishedAt) return;

    records.push({
      originRecordId: `hnx-${idMatch[1]}`,
      title,
      publishedAt,
      tickerGuess: extractTicker(title),
    });
  });

  return records;
}
