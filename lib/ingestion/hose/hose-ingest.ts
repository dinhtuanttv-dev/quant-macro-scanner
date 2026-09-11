// lib/ingestion/hose/hose-ingest.ts
// Gop 2 nguon tu HOSE:
// (1) Su kien co tuc/quyen THAT (tu bang "Su kien doanh nghiep" nhung trong
//     tin hang ngay) - luon trung lap (khong bia huong tich cuc/tieu cuc,
//     chi la thong bao hanh chinh ve ngay chot quyen).
// (2) Tin TIEU CUC ro rang tu cac loai tin khac (dinh chi/canh bao/margin) -
//     dung chung bo tu khoa da xac nhan hoat dong voi HNX.
import { prisma } from "@/lib/prisma";
import { fetchHoseNews, extractCorporateEvents, extractForeignNetBuyTickers, DAILY_SUMMARY_CAT_ID, type HoseNewsRecord } from "./hose-news-fetcher";
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
  foreignNetBuyTickers: string[];
  errorCount: number;
}

export async function ingestHoseData(): Promise<HoseIngestResult> {
  const result: HoseIngestResult = { fetchedNewsCount: 0, corporateEventsSaved: 0, negativeNewsSaved: 0, foreignNetBuyTickers: [], errorCount: 0 };

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

  // MOI (2026-09-11): trich 5 ma khoi ngoai mua rong nhieu nhat tu chinh
  // ban tin "Diem tin giao dich" hang ngay (KHONG can nguon moi, KHONG ton
  // phi - da xac nhan du lieu that co san trong ban tin nay). Ghi vao bang
  // cache 1-dong "hose_foreign_net_buy" de marketSignals.ts doc lai.
  const dailySummary = news.find((n) => n.catId === DAILY_SUMMARY_CAT_ID);
  if (dailySummary) {
    const tickers = extractForeignNetBuyTickers(dailySummary);
    result.foreignNetBuyTickers = tickers;
    if (tickers.length > 0) {
      try {
        const tradingDate = dailySummary.postedDate.toISOString().slice(0, 10);
        await prisma.$executeRaw`
          INSERT INTO hose_foreign_net_buy (id, tickers, trading_date, fetched_at)
          VALUES ('latest', ${JSON.stringify(tickers)}::jsonb, ${tradingDate}, now())
          ON CONFLICT (id) DO UPDATE SET tickers = EXCLUDED.tickers, trading_date = EXCLUDED.trading_date, fetched_at = EXCLUDED.fetched_at
        `;
      } catch (err) {
        console.error("[hose-ingest] Loi ghi hose_foreign_net_buy:", err);
        result.errorCount++;
      }
    }
  }

  return result;
}
