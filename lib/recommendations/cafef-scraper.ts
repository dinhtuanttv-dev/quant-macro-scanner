// lib/recommendations/cafef-scraper.ts
// Scraper 2 bước cho CafeF:
//   Bước 1: trang danh sách -> chỉ lấy URL các báo cáo (danh sách không đủ tin cậy để lấy nguồn).
//   Bước 2: fetch TỪNG trang báo cáo chi tiết -> đọc meta og:title/og:description, nơi LUÔN có
//           dòng "Nguồn báo cáo: {tên công ty chứng khoán}" (đã xác nhận qua 2 mẫu thật: VEA, NKG).
// Ngành được tra cứu trực tiếp từ stockUniverse theo mã, KHÔNG chạy classifySectors trên tiêu đề
// (tiêu đề khuyến nghị hiếm khi chứa từ khoá ngành, chỉ có mã cổ phiếu).

import * as cheerio from "cheerio";
import type { RawSourceRecord } from "@/lib/catalyst/types";
import { stockUniverse } from "@/lib/quant-data";

const CAFEF_LIST_URL =
  "https://cafef.vn/du-lieu/phan-tich-bao-cao/cap-nhat-doanh-nghiep-khuyen-nghi.chn";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
};

const MAX_REPORTS_PER_SCAN = 30; // giới hạn số trang chi tiết fetch mỗi lần chạy, tránh quá tải + quá lâu
const DETAIL_FETCH_DELAY_MS = 300; // giãn cách giữa các request trang chi tiết, tôn trọng server CafeF

const TICKER_TO_SECTOR = new Map(stockUniverse.map((s) => [s.ticker, s.sector]));

type RecommendationType = "MUA" | "BAN" | "KHA_QUAN" | "KEM_KHA_QUAN" | "TRUNG_LAP";

function normalizeRecommendation(raw: string): RecommendationType | null {
  const lower = raw.toLowerCase();
  if (lower.includes("mua")) return "MUA";
  if (lower.includes("bán") || lower.includes("ban ")) return "BAN";
  if (lower.includes("kém khả quan") || lower.includes("kem kha quan")) return "KEM_KHA_QUAN";
  if (lower.includes("khả quan")) return "KHA_QUAN";
  if (lower.includes("trung lập") || lower.includes("phù hợp thị trường")) return "TRUNG_LAP";
  return null;
}

function parsePriceNumber(text: string): number {
  return Number(text.replace(/[.,]/g, ""));
}

interface ParsedTitle {
  ticker: string;
  recommendationType: RecommendationType;
  targetPrice: number | null;
}

function parseTitle(title: string): ParsedTitle | null {
  // Mẫu 1: "VEA (KHẢ QUAN, Giá mục tiêu: 38.000 Đồng/cp): ..."
  const pattern1 = title.match(
    /^([A-Z]{3})\s*\(([^,]+),\s*Gi[áa] m[ụu]c ti[êe]u:\s*([\d.,]+)\s*[ĐđDd][ồô]ng/i
  );
  if (pattern1) {
    const recommendationType = normalizeRecommendation(pattern1[2]);
    if (recommendationType) {
      return { ticker: pattern1[1], recommendationType, targetPrice: parsePriceNumber(pattern1[3]) };
    }
  }

  // Mẫu 2: "NKG: Khuyến nghị MUA với giá mục tiêu 14,400 đồng/cổ phiếu"
  const pattern2 = title.match(
    /^([A-Z]{3}):\s*Khuy[ếe]n ngh[ịi]\s+(\S+)\s+v[ớo]i gi[áa] m[ụu]c ti[êe]u\s+([\d.,]+)\s*[đĐ][ồô]ng/i
  );
  if (pattern2) {
    const recommendationType = normalizeRecommendation(pattern2[2]);
    if (recommendationType) {
      return { ticker: pattern2[1], recommendationType, targetPrice: parsePriceNumber(pattern2[3]) };
    }
  }

  return null;
}

// Trích "Nguồn báo cáo: Công ty cổ phần Chứng khoán Sài Gòn" -> "Công ty cổ phần Chứng khoán Sài Gòn"
function parseSourceOrgName(description: string): string | null {
  const match = description.match(/Ngu[ồo]n b[áa]o c[áa]o:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

function parseVnDate(text: string): Date {
  const match = text.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return new Date();
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

// Bước 1: chỉ lấy URL + ngày từ trang danh sách (không tin phần "nguồn" ở đây, đa số item thiếu)
async function fetchReportUrls(): Promise<{ url: string; listDate: Date }[]> {
  const res = await fetch(CAFEF_LIST_URL, { headers: REQUEST_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`CafeF list page tra ve HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: { url: string; listDate: Date }[] = [];
  const seenUrls = new Set<string>();

  $(".item-first-content-title a, .item-child-content-title a").each((_, el) => {
    const relativeUrl = $(el).attr("href");
    if (!relativeUrl) return;
    const url = relativeUrl.startsWith("http") ? relativeUrl.split("?")[0] : `https://cafef.vn${relativeUrl.split("?")[0]}`;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    const container = $(el).closest(".item-first, .item-child");
    const timeText = container.find(
      ".item-first-content-footer-left-time, .item-child-content-time-link-time"
    ).text();
    results.push({ url, listDate: parseVnDate(timeText) });
  });

  return results.slice(0, MAX_REPORTS_PER_SCAN);
}

// Bước 2: fetch từng trang chi tiết, đọc og:title + og:description
async function fetchReportDetail(url: string): Promise<RawSourceRecord | null> {
  const res = await fetch(url, { headers: REQUEST_HEADERS, cache: "no-store" });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";

  // og:title có dạng "{tiêu đề gốc} | Báo cáo phân tích CafeF.vn" -> bỏ phần đuôi cố định
  const cleanTitle = ogTitle.replace(/\s*\|\s*B[áa]o c[áa]o ph[âa]n t[íi]ch CafeF\.vn\s*$/i, "").trim();

  const parsed = parseTitle(cleanTitle);
  if (!parsed) return null;

  const sector = TICKER_TO_SECTOR.get(parsed.ticker);
  if (!sector) return null; // mã không nằm trong danh mục đang theo dõi -> bỏ qua

  const sourceOrgName = parseSourceOrgName(ogDescription) ?? "CafeF";

  const direction: "benefit" | "harm" =
    parsed.recommendationType === "BAN" || parsed.recommendationType === "KEM_KHA_QUAN" ? "harm" : "benefit";

  if (parsed.recommendationType === "TRUNG_LAP") return null;

  return {
    title: cleanTitle,
    category: "rating",
    sourceName: sourceOrgName,
    sourceUrl: url,
    sourceCredibility: "confirmed",
    publishedDate: new Date(), // ghi đè bằng listDate ở nơi gọi (fetchReportUrls đã có ngày chính xác hơn)
    direction,
    baseWeight: 6,
    decayRate: 0.15,
    horizon: "medium",
    sectors: [sector],
    tickers: [parsed.ticker],
    targetPrice: parsed.targetPrice ?? undefined,
  };
}

export async function scrapeCafefRecommendations(): Promise<RawSourceRecord[]> {
  const urls = await fetchReportUrls();
  const records: RawSourceRecord[] = [];

  for (const { url, listDate } of urls) {
    try {
      const record = await fetchReportDetail(url);
      if (record) {
        record.publishedDate = listDate; // dùng ngày từ trang danh sách, chính xác hơn ngày mặc định
        records.push(record);
      }
    } catch (err) {
      console.error(`Loi fetch report detail ${url}:`, err);
    }
    await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
  }

  return records;
}