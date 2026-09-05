// lib/recommendations/cafef-scraper.ts — PHASE 1+2+3 UPGRADE
// Phase 2: ScanCircuitBreaker (dung khi nghi bi chan)
// Phase 3: ScanTimeBudget (dung theo thoi gian con lai, khong chi so dem cung)

import * as cheerio from "cheerio";
import type { RawSourceRecord } from "@/lib/catalyst/types";
import { stockUniverse } from "@/lib/quant-data";
import { ScanCircuitBreaker, logCircuitBreakerTrip } from "@/lib/catalyst/engine/ScanCircuitBreaker";
import { ScanTimeBudget } from "@/lib/catalyst/engine/ScanTimeBudget"; // ★PHASE 3

const CAFEF_LIST_URL =
  "https://cafef.vn/du-lieu/phan-tich-bao-cao/cap-nhat-doanh-nghiep-khuyen-nghi.chn";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
};

const MAX_REPORTS_PER_SCAN = 30; // vẫn giữ làm TRẦN TRÊN, không còn là điều kiện dừng chính
const DETAIL_FETCH_DELAY_MS = 300;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const SCRAPER_MAX_DURATION_MS = 8500; // để dư margin cho phần ingestBatch() chạy sau, tổng route vẫn dưới 10s
const ESTIMATED_MS_PER_ITERATION = DETAIL_FETCH_DELAY_MS + 600; // ước lượng fetch + xử lý ~600ms/trang

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
  const pattern1 = title.match(
    /^([A-Z]{3})\s*\(([^,]+),\s*Gi[áa] m[ụu]c ti[êe]u:\s*([\d.,]+)\s*[ĐđDd][ồô]ng/i
  );
  if (pattern1) {
    const recommendationType = normalizeRecommendation(pattern1[2]);
    if (recommendationType) {
      return { ticker: pattern1[1], recommendationType, targetPrice: parsePriceNumber(pattern1[3]) };
    }
  }

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

async function fetchReportDetail(url: string): Promise<RawSourceRecord | null> {
  const res = await fetch(url, { headers: REQUEST_HEADERS, cache: "no-store" });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";

  const cleanTitle = ogTitle.replace(/\s*\|\s*B[áa]o c[áa]o ph[âa]n t[íi]ch CafeF\.vn\s*$/i, "").trim();

  const parsed = parseTitle(cleanTitle);
  if (!parsed) return null;

  const sector = TICKER_TO_SECTOR.get(parsed.ticker);
  if (!sector) return null;

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
    publishedDate: new Date(),
    direction,
    baseWeight: 6,
    decayRate: 0.15,
    horizon: "medium",
    sectors: [sector],
    tickers: [parsed.ticker],
    targetPrice: parsed.targetPrice ?? undefined,
  };
}

export interface ScrapeResult {
  records: RawSourceRecord[];
  circuitBreakerTripped: boolean;
  timeBudgetExhausted: boolean; // ★PHASE 3: cho biết đã dừng do hết ngân sách thời gian
  attemptedCount: number;
  successCount: number;
  elapsedMs: number;
}

export async function scrapeCafefRecommendations(): Promise<ScrapeResult> {
  const urls = await fetchReportUrls();
  const records: RawSourceRecord[] = [];
  const breaker = new ScanCircuitBreaker(CIRCUIT_BREAKER_THRESHOLD);
  const budget = new ScanTimeBudget(SCRAPER_MAX_DURATION_MS); // ★PHASE 3
  let timeBudgetExhausted = false;

  for (const { url, listDate } of urls) {
    if (breaker.isTripped()) break;

    // ★PHASE 3: kiểm tra CÓ ĐỦ thời gian cho vòng lặp tiếp theo không, trước khi
    // bắt đầu — tránh tình huống bắt đầu 1 request rồi bị cắt ngang giữa chừng
    if (!budget.canAffordNextIteration(ESTIMATED_MS_PER_ITERATION)) {
      timeBudgetExhausted = true;
      console.warn(
        `[cafef-scraper] Dung som do het ngan sach thoi gian - da xu ly ${records.length}/${urls.length} URL trong ${budget.elapsedMs()}ms`
      );
      break;
    }

    try {
      const record = await fetchReportDetail(url);
      if (record) {
        record.publishedDate = listDate;
        records.push(record);
      }
      breaker.recordSuccess();
    } catch (err) {
      console.error(`Loi fetch report detail ${url}:`, err);
      breaker.recordFailure();
    }
    await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
  }

  const state = breaker.getState();
  if (state.tripped) {
    console.warn(`[cafef-scraper] Circuit breaker TRIPPED sau ${state.consecutiveFailures} loi lien tiep`);
    await logCircuitBreakerTrip("cafef-scraper", state);
  }

  return {
    records,
    circuitBreakerTripped: state.tripped,
    timeBudgetExhausted,
    attemptedCount: state.totalAttempts,
    successCount: state.totalAttempts - state.totalFailures,
    elapsedMs: budget.elapsedMs(),
  };
}
