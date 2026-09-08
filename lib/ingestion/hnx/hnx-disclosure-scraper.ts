// lib/ingestion/hnx/hnx-disclosure-scraper.ts
// Nguon tin cong bo CHINH THUC tu So Giao dich Chung khoan Ha Noi (HNX) -
// muc "Tin tu To chuc phat hanh chua giao dich" (UpCoM). Day la cong bo
// thong tin THAT tu chinh So, do tin cay cao nhat trong toan he thong.
// Dung POST form-urlencoded, response la HTML fragment (khong phai JSON).
//
// GHI CHU VE SSL: hnx.vn dung chuoi chung chi ma runtime khong xac minh
// duoc day du (UNABLE_TO_VERIFY_LEAF_SIGNATURE - loi PHIA HNX). fetch()
// toan cuc cua Next.js dung undici, nen phai dung undici.Agent voi
// connect: { rejectUnauthorized: false } - https.Agent thong thuong
// KHONG co tac dung voi undici (da xac nhan qua log loi thuc te).
//
// GHI CHU VE SELECTOR: HTML tra ve KHONG co the <tbody> tuong minh, dung
// "table tr" roi loc bo dong tieu de bang kiem tra khong co <th>.
//
// GHI CHU VE COT NGAY: cot STT ("1", "2"...) VA cot ngay cung mang chung
// class "tdCenterAlign" (cot STT co them class rieng "STT"). Neu dung
// .eq(0) se lay NHAM cot STT thay vi cot ngay - da xac nhan qua debug
// HTML thuc te. Dung :not(.STT) de loai truc tiep, khong dua vao vi tri.
import * as cheerio from "cheerio";
import { Agent } from "undici";

const HNX_ENDPOINT = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinTCPHChuaGD_UpCoM";
const REFERER = "https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html";

const hnxAgent = new Agent({ connect: { rejectUnauthorized: false } });

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
    // @ts-expect-error - "dispatcher" la tuy chon rieng cua undici, khong nam trong type chuan RequestInit nhung Next.js runtime ho tro that
    dispatcher: hnxAgent,
  });

  if (!res.ok) throw new Error(`HNX tra ve HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const records: HnxDisclosureRecord[] = [];

  $("table#_tableDatas tr").each((_, el) => {
    const row = $(el);
    if (row.find("th").length > 0) return;

    const dateText = row.find("td.tdCenterAlign:not(.STT)").first().text().trim();
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
