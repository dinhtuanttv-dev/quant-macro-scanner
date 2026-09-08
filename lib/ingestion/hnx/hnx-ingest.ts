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

interface NegativeSignalRule {
  keywords: string[];
  severity: "critical" | "high";
  rawImpact: number;
  typeLabel: string;
}

const NEGATIVE_RULES: NegativeSignalRule[] = [
  { keywords: ["dinh chi giao dich", "đình chỉ giao dịch"], severity: "critical", rawImpact: -9, typeLabel: "HNX - Dinh chi giao dich" },
  { keywords: ["huy niem yet", "hủy niêm yết", "huy dkgd"], severity: "critical", rawImpact: -9, typeLabel: "HNX - Huy niem yet" },
  { keywords: ["cham thanh toan", "chậm thanh toán"], severity: "critical", rawImpact: -8, typeLabel: "HNX - Cham thanh toan trai phieu" },
  { keywords: ["kiem soat dac biet", "kiểm soát đặc biệt", "dien kiem soat", "diện kiểm soát"], severity: "high", rawImpact: -6, typeLabel: "HNX - Dien kiem soat" },
  { keywords: ["canh bao", "cảnh báo", "dien canh bao", "diện cảnh báo"], severity: "high", rawImpact: -5, typeLabel: "HNX - Canh bao" },
  { keywords: ["han che giao dich", "hạn chế giao dịch"], severity: "high", rawImpact: -5, typeLabel: "HNX - Han che giao dich" },
];

function normalizeText(s: string): string {
  return s.toLowerCase();
}

function matchNegativeRule(title: string): NegativeSignalRule | null {
  const normalized = normalizeText(title);
  for (const rule of NEGATIVE_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(normalizeText(kw)))) return rule;
  }
  return null;
}

// Tra 2 nguon theo thu tu uu tien: stockUniverse (ma lon, da phan loai san)
// truoc, roi den UPCOM_TICKER_SECTOR (ma nho, tra cuu rieng, chi de hien
// thi - khong dinh gi den diem so FA). Neu khong co o ca 2 -> tra ve rong,
// KHONG bia nganh.
function findSectorForTicker(ticker: string | null): string[] {
  if (!ticker) return [];
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
          relatedTickers: record.tickerGuess ? [record.tickerGuess] : [],
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
          relatedTickers: record.tickerGuess ? [record.tickerGuess] : [],
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
