// lib/recommendations/cafef-scraper.ts
// Scraper cho trang tin tức khuyến nghị/tin tức doanh nghiệp của CafeF.
//
// !!! QUAN TRỌNG: các selector CSS dưới đây (`.listres`, `.tlitem`...) là VÍ DỤ MẪU dựa trên
// cấu trúc phổ biến của trang tin tài chính Việt Nam, KHÔNG được xác nhận 100% khớp với HTML
// thật của CafeF tại thời điểm bạn chạy code này (cấu trúc trang có thể đã đổi).
// BẮT BUỘC: mở DevTools trên trang CafeF thật, kiểm tra lại đúng class/id, sửa lại các
// dòng `.querySelector(...)` bên dưới cho khớp trước khi đưa vào production.

import * as cheerio from "cheerio";
import type { RawSourceRecord } from "@/lib/catalyst/types";
import { classifySectors } from "@/lib/macro/classifier"; // tái dùng bộ phân loại ngành đã có sẵn

const CAFEF_LIST_URL = "https://cafef.vn/du-lieu/khuyen-nghi-dau-tu.chn"; // TODO: xác nhận đúng URL thật

// Header giả lập trình duyệt thật — kỹ thuật tiêu chuẩn, KHÔNG dùng proxy xoay vòng để né chặn.
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
};

interface CafefRawItem {
  title: string;
  url: string;
  ticker: string | null;
  recommendationType: string; // "MUA" | "BÁN" | "THEO DÕI" ...
  targetPrice: number | null;
  publishedDate: Date;
}

function parseRecommendationType(text: string): "MUA" | "BAN" | "THEO_DOI" | null {
  const lower = text.toLowerCase();
  if (lower.includes("mua")) return "MUA";
  if (lower.includes("bán") || lower.includes("ban")) return "BAN";
  if (lower.includes("theo dõi") || lower.includes("nam giu")) return "THEO_DOI";
  return null;
}

function extractTargetPrice(text: string): number | null {
  // Tìm mẫu số dạng "giá mục tiêu 32,500" hoặc "target price 32.500"
  const match = text.match(/(?:gia muc tieu|target price|gmt)[:\s]*([\d.,]+)/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(/[.,]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

async function fetchListPage(): Promise<CafefRawItem[]> {
  const res = await fetch(CAFEF_LIST_URL, { headers: REQUEST_HEADERS, cache: "no-store" });

  if (!res.ok) {
    throw new Error(`CafeF tra ve HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const items: CafefRawItem[] = [];

  // TODO: xác nhận lại đúng selector — đây là ví dụ theo cấu trúc list bài viết phổ biến
  $(".listres .tlitem, .knswli-content .item").each((_, el) => {
    const anchor = $(el).find("a").first();
    const title = anchor.text().trim();
    const relativeUrl = anchor.attr("href") ?? "";
    const url = relativeUrl.startsWith("http") ? relativeUrl : `https://cafef.vn${relativeUrl}`;

    const fullText = $(el).text();
    const tickerMatch = fullText.match(/\b([A-Z]{3})\b/); // mã CK Việt Nam luôn 3 ký tự viết hoa
    const recommendationType = parseRecommendationType(fullText);
    const targetPrice = extractTargetPrice(fullText);

    const dateText = $(el).find(".time, .date").first().text().trim();
    const publishedDate = dateText ? new Date(dateText) : new Date();

    if (title && recommendationType) {
      items.push({
        title,
        url,
        ticker: tickerMatch ? tickerMatch[1] : null,
        recommendationType,
        targetPrice,
        publishedDate: isNaN(publishedDate.getTime()) ? new Date() : publishedDate,
      });
    }
  });

  return items;
}

export async function scrapeCafefRecommendations(): Promise<RawSourceRecord[]> {
  const rawItems = await fetchListPage();
  const records: RawSourceRecord[] = [];

  for (const item of rawItems) {
    if (!item.ticker) continue; // bỏ qua nếu không xác định được mã cụ thể

    const direction = item.recommendationType === "BAN" ? "harm" : "benefit";
    if (item.recommendationType === "THEO_DOI") continue; // "theo dõi" không phải tín hiệu rõ ràng

    const sectors = classifySectors(item.title).filter((s) => s !== "Macro_General");

    records.push({
      title: item.title,
      category: "rating",
      sourceName: "CafeF",
      sourceUrl: item.url,
      sourceCredibility: "confirmed",
      publishedDate: item.publishedDate,
      direction,
      baseWeight: 6, // độ mạnh mặc định cho khuyến nghị công ty chứng khoán, chưa phân theo mức độ mạnh/yếu
      decayRate: 0.15,
      horizon: "medium",
      sectors,
      tickers: [item.ticker],
      targetPrice: item.targetPrice ?? undefined,
    });

    // Giới hạn tốc độ nhẹ giữa các lần xử lý (không phải giữa các request HTTP vì đây chỉ có 1 request
    // cho trang danh sách) — nếu sau này mở rộng sang việc gọi chi tiết từng bài, cần delay giữa mỗi request.
  }

  return records;
}