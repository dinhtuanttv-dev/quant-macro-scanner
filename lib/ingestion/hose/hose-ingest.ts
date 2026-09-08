// lib/ingestion/hose/hose-ingest.ts
// Gop 2 nguon tu HOSE:
// (1) Su kien co tuc/quyen THAT (tu bang "Su kien doanh nghiep" nhung trong
//     tin hang ngay) - luon trung lap (khong bia huong tich cuc/tieu cuc,
//     chi la thong bao hanh chinh ve ngay chot quyen).
// (2) Tin TIEU CUC ro rang tu cac loai tin khac (dinh chi/canh bao/margin) -
//     dung chung bo tu khoa da xac nhan hoat dong voi HNX.
import { prisma } from "@/lib/prisma";
import { fetchHoseNews, extractCorporateEvents, type HoseNewsRecord } from "./hose-news-fetcher";
import { stockUniverse } from "@/lib/quant-data";

interface NegativeRule { keywords: string[]; severity: "critical" | "high"; rawImpact: number; typeLabel: string; }

const NEGATIVE_RULES: NegativeRule[] = [
  { keywords: ["đình chỉ giao dịch"], severity: "critical", rawImpact: -9, typeLabel: "HOSE - Dinh chi giao dich" },
  { keywords: ["hủy niêm yết"], severity: "critical", rawImpact: -9, typeLabel: "HOSE - Huy niem yet" },
  { keywords: ["chậm thanh toán"], severity: "critical", rawImpact: -8, typeLabel: "HOSE - Cham thanh toan" },
  { keywords: ["kiểm soát đặc biệt", "diện kiểm soát"], severity: "high", rawImpact: -6, typeLabel: "HOSE - Dien kiem soat" },
  { keywords: ["cảnh báo", "diện cảnh báo"], severity: "high", rawImpact: -5, typeLabel: "HOSE - Canh bao" },
  { keywords: ["hạn chế giao dịch"], severity: "high", rawImpact: -5, typeLabel: "HOSE - Han che giao dich" },
  { keywords: ["không đủ điều kiện giao dịch ký quỹ"], severity: "high", rawImpact: -3, typeLabel: "HOSE - Mat margin" },
];

function matchNegativeRule(title: string): NegativeRule | null {
  const normalized = title.toLowerCase();
  for (const rule of NEGATIVE_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) return rule;
  }
  return null;
}

function findSector(ticker: string): string[] {
  const stock = stockUniverse.find((s) => s.ticker === ticker);
  return stock ? [stock.sector] : [];
}

export interface HoseIngestResult {
  fetchedNewsCount: number;
  corporateEventsSaved: number;
  negativeNewsSaved: number;
  errorCount: number;
}

export async function ingestHoseData(): Promise<HoseIngestResult> {
  const result: HoseIngestResult = { fetchedNewsCount: 0, corporateEventsSaved: 0, negativeNewsSaved: 0, errorCount: 0 };

  let news: HoseNewsRecord[];
  try {
    news = await fetchHoseNews(7);
  } catch (err) {
    console.error("[hose-ingest] Loi khi lay tin HOSE:", err);
    result.errorCount++;
    return result;
  }
  result.fetchedNewsCount = news.length;

  // (1) Su kien co tuc/quyen - ghi nhu tin "quy dinh" trung lap, dung de
  // hien thi "sap chot quyen", KHONG gan huong tich cuc/tieu cuc.
  for (const record of news) {
    const events = extractCorporateEvents(record);
    for (const ev of events) {
      const contentHash = `hose-event-${record.id}-${ev.ticker}`;
      try {
        await prisma.macroNewsRecord.upsert({
          where: { contentHash },
          update: { affectedSectors: findSector(ev.ticker), relatedTickers: [ev.ticker] },
          create: {
            headline: ev.description,
            summary: null,
            url: "https://www.hsx.vn",
            type: "HOSE - Su kien co tuc/quyen",
            scope: "vn_exchange_corporate_event",
            sourceId: contentHash,
            sourceName: "HOSE - Cong bo chinh thuc",
            rawImpact: 0, // trung lap - chi la thong tin hanh chinh, khong phai catalyst co huong
            severity: "low",
            affectedSectors: findSector(ev.ticker),
            relatedTickers: [ev.ticker],
            contentHash,
            publishedAt: ev.publishedAt,
          },
        });
        result.corporateEventsSaved++;
      } catch (err) {
        console.error(`[hose-ingest] Loi ghi su kien ${contentHash}:`, err);
        result.errorCount++;
      }
    }
  }

  // (2) Tin TIEU CUC ro rang
  for (const record of news) {
    const rule = matchNegativeRule(record.title);
    if (!rule) continue;

    const contentHash = `hose-neg-${record.id}`;
    // Doan mo ta co the chua ma CK - tim don gian bang regex chu hoa 3-5 ky tu
    const tickerMatch = record.title.match(/\b([A-Z]{3,5})\b/);
    const ticker = tickerMatch ? tickerMatch[1] : null;

    try {
      await prisma.macroNewsRecord.upsert({
        where: { contentHash },
        update: { affectedSectors: ticker ? findSector(ticker) : [], relatedTickers: ticker ? [ticker] : [] },
        create: {
          headline: record.title,
          summary: null,
          url: "https://www.hsx.vn",
          type: rule.typeLabel,
          scope: "vn_exchange_disclosure",
          sourceId: contentHash,
          sourceName: "HOSE - Cong bo chinh thuc",
          rawImpact: rule.rawImpact,
          severity: rule.severity,
          affectedSectors: ticker ? findSector(ticker) : [],
          relatedTickers: ticker ? [ticker] : [],
          contentHash,
          publishedAt: record.postedDate,
        },
      });
      result.negativeNewsSaved++;
    } catch (err) {
      console.error(`[hose-ingest] Loi ghi tin tieu cuc ${contentHash}:`, err);
      result.errorCount++;
    }
  }

  return result;
}
