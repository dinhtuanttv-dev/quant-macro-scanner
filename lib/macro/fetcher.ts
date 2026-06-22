import { createHash } from "crypto";
import { prisma } from "../prisma";
import { toSeverity } from "./classifier";
import type { MacroNewsAdapter } from "./adapters/base";
import type { FetchResult, RawMacroNewsItem } from "./types";
import { RssMacroNewsAdapter } from "./adapters/rss-adapter";
import { ScrapingMacroNewsAdapter } from "./adapters/scraping-adapter";

const rssAdapters: MacroNewsAdapter[] = [
  new RssMacroNewsAdapter({ sourceId: "investing", sourceName: "Investing.com", feedUrl: "https://www.investing.com/rss/news_285.rss", scope: "Global" }),
  new RssMacroNewsAdapter({ sourceId: "reuters", sourceName: "Reuters Markets", feedUrl: "https://www.reutersagency.com/feed/?best-topics=markets", scope: "Global" }),
];

const scrapingAdapters: MacroNewsAdapter[] = [
  new ScrapingMacroNewsAdapter({
    sourceId: "cafef", sourceName: "CafeF", listingUrl: "https://cafef.vn/vi-mo-dau-tu.chn", baseUrl: "https://cafef.vn", scope: "Domestic",
    selectors: { itemSelector: ".tlitem", titleSelector: "h3 a", linkSelector: "h3 a", summarySelector: ".sapo" },
  }),
  new ScrapingMacroNewsAdapter({
    sourceId: "vietstock", sourceName: "Vietstock", listingUrl: "https://vietstock.vn/chung-khoan.htm", baseUrl: "https://vietstock.vn", scope: "Domestic",
    selectors: { itemSelector: ".list-news .item", titleSelector: "a.title", linkSelector: "a.title" },
  }),
];

const ALL_ADAPTERS: MacroNewsAdapter[] = [...rssAdapters, ...scrapingAdapters];

function buildContentHash(item: RawMacroNewsItem): string {
  return createHash("sha256").update(`${item.sourceId}:${item.headline}`).digest("hex");
}

function toRecord(item: RawMacroNewsItem, fetchedAt: string) {
  return {
    headline: item.headline,
    summary: item.summary ?? null,
    url: item.url,
    type: item.type,
    scope: item.scope,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    rawImpact: item.rawImpact,
    severity: toSeverity(item.rawImpact),
    affectedSectors: item.affectedSectors,
    relatedTickers: item.relatedTickers ?? [],
    contentHash: buildContentHash(item),
    publishedAt: new Date(item.publishedAt),
    fetchedAt: new Date(fetchedAt),
  };
}

export interface MacroFetchSummary {
  totalFetched: number;
  totalSaved: number;
  totalSkippedDuplicate: number;
  perSource: Array<{ sourceId: string; success: boolean; count: number; error?: string }>;
}

export async function runMacroNewsFetch(): Promise<MacroFetchSummary> {
  const fetchedAt = new Date().toISOString();
  const settled = await Promise.allSettled(ALL_ADAPTERS.map((a) => a.fetch()));
  const results: FetchResult[] = settled.map((r, idx) =>
    r.status === "fulfilled" ? r.value : {
      sourceId: ALL_ADAPTERS[idx].sourceId, items: [], fetchedAt, success: false,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    }
  );
  const allItems = results.flatMap((r) => r.items);
  const records = allItems.map((item) => toRecord(item, fetchedAt));
  let totalSaved = 0;
  let totalSkippedDuplicate = 0;
  for (const record of records) {
    try {
      const existing = await prisma.macroNewsRecord.findUnique({ where: { contentHash: record.contentHash }, select: { id: true } });
      if (existing) { totalSkippedDuplicate += 1; continue; }
      await prisma.macroNewsRecord.create({ data: record });
      totalSaved += 1;
    } catch (err) {
      console.error(`Failed to save record: ${record.headline}`, err);
    }
  }
  return {
    totalFetched: allItems.length,
    totalSaved,
    totalSkippedDuplicate,
    perSource: results.map((r) => ({ sourceId: r.sourceId, success: r.success, count: r.items.length, error: r.error })),
  };
}

export async function getRecentMacroNews(options?: { scope?: "Domestic" | "Global"; minSeverity?: "low" | "medium" | "high" | "critical"; sinceHours?: number; limit?: number }) {
  const sinceHours = options?.sinceHours ?? 24;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const severityOrder = ["low", "medium", "high", "critical"];
  const minSeverityIdx = options?.minSeverity ? severityOrder.indexOf(options.minSeverity) : 0;
  const allowedSeverities = severityOrder.slice(minSeverityIdx);
  return prisma.macroNewsRecord.findMany({
    where: { publishedAt: { gte: since }, ...(options?.scope ? { scope: options.scope } : {}), severity: { in: allowedSeverities } },
    orderBy: { publishedAt: "desc" },
    take: options?.limit ?? 100,
  });
}