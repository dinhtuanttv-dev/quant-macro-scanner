// lib/ingestion/hnx/hnx-ingest.ts
// Loc CHI giu lai thong bao HNX co huong TIEU CUC ro rang that (dinh chi
// giao dich, huy niem yet, canh bao, kiem soat dac biet, cham thanh toan
// trai phieu). BO QUA moi loai khac (bao cao tai chinh dinh ky, hop DHCD,
// dang ky quyen...) vi day la thong bao hanh chinh TRUNG LAP - khong bia
// huong tac dong cho chung.
import { prisma } from "@/lib/prisma";
import { fetchHnxDisclosures, type HnxDisclosureRecord } from "./hnx-disclosure-scraper";
import { stockUniverse } from "@/lib/quant-data";
import { UPCOM_TICKER_SECTOR } from "./ticker-sector-lookup";
import { isStockTicker, matchExchangeNegative } from "@/lib/ingestion/exchangeEventRules";

// Quy tắc tin tiêu cực: dùng chung với HOSE (lib/ingestion/exchangeEventRules.ts).
const matchNegativeRule = (title: string) => {
  const r = matchExchangeNegative(title);
  return r && { ...r, typeLabel: `HNX - ${r.labelVi}` };
};

// Tra 2 nguon theo thu tu uu tien: stockUniverse (ma lon, da phan loai san)
// truoc, roi den UPCOM_TICKER_SECTOR (ma nho, tra cuu rieng, chi de hien
// thi - khong dinh gi den diem so FA). Neu khong co o ca 2 -> tra ve rong,
// KHONG bia nganh.
function findSectorForTicker(ticker: string | null): string[] {
  if (!isStockTicker(ticker)) return [];
  const stock = stockUniverse.find((s) => s.ticker === ticker);
  if (stock) return [stock.sector];
  const upcomSector = UPCOM_TICKER_SECTOR[ticker];
  if (upcomSector) return [upcomSector];
  return [];
}

export interface HnxIngestResult {
  fetchedCount: number;
  negativeMatchCount: number;
  savedCount: number;
  skippedNeutralCount: number;
  errorCount: number;
}

export async function ingestHnxDisclosures(): Promise<HnxIngestResult> {
  const result: HnxIngestResult = { fetchedCount: 0, negativeMatchCount: 0, savedCount: 0, skippedNeutralCount: 0, errorCount: 0 };

  let records: HnxDisclosureRecord[];
  try {
    records = await fetchHnxDisclosures(50);
  } catch (err) {
    console.error("[hnx-ingest] Loi khi scrape HNX:", err);
    result.errorCount++;
    return result;
  }

  result.fetchedCount = records.length;

  for (const record of records) {
    const rule = matchNegativeRule(record.title);
    if (!rule) { result.skippedNeutralCount++; continue; }
    result.negativeMatchCount++;

    try {
      await prisma.macroNewsRecord.upsert({
        where: { contentHash: record.originRecordId },
        update: {
          affectedSectors: findSectorForTicker(record.tickerGuess),
          relatedTickers: isStockTicker(record.tickerGuess) ? [record.tickerGuess] : [],
        },
        create: {
          headline: record.title,
          summary: null,
          url: "https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html",
          type: rule.typeLabel,
          scope: "vn_exchange_disclosure",
          sourceId: record.originRecordId,
          sourceName: "HNX - Cong bo thong tin chinh thuc",
          rawImpact: rule.rawImpact,
          severity: rule.severity,
          affectedSectors: findSectorForTicker(record.tickerGuess),
          relatedTickers: isStockTicker(record.tickerGuess) ? [record.tickerGuess] : [],
          contentHash: record.originRecordId,
          publishedAt: record.publishedAt,
        },
      });
      result.savedCount++;
    } catch (err) {
      console.error(`[hnx-ingest] Loi ghi ban ghi ${record.originRecordId}:`, err);
      result.errorCount++;
    }
  }

  return result;
}
