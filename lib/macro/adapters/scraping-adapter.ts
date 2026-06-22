import * as cheerio from "cheerio";
import type { MacroNewsAdapter } from "./base";
import { safeFetch } from "./base";
import type { FetchResult, MacroScope, MacroSourceId, RawMacroNewsItem } from "../types";
import { classifyImpact, classifySectors } from "../classifier";

interface ScrapeSelectorConfig {
  itemSelector: string;
  titleSelector: string;
  linkSelector: string;
  dateSelector?: string;
  summarySelector?: string;
}

interface ScrapingAdapterConfig {
  sourceId: MacroSourceId;
  sourceName: string;
  listingUrl: string;
  baseUrl: string;
  scope: MacroScope;
  selectors: ScrapeSelectorConfig;
  maxItems?: number;
}

export class ScrapingMacroNewsAdapter implements MacroNewsAdapter {
  readonly sourceId: MacroSourceId;
  readonly sourceName: string;
  private readonly listingUrl: string;
  private readonly baseUrl: string;
  private readonly scope: MacroScope;
  private readonly selectors: ScrapeSelectorConfig;
  private readonly maxItems: number;

  constructor(config: ScrapingAdapterConfig) {
    this.sourceId = config.sourceId;
    this.sourceName = config.sourceName;
    this.listingUrl = config.listingUrl;
    this.baseUrl = config.baseUrl;
    this.scope = config.scope;
    this.selectors = config.selectors;
    this.maxItems = config.maxItems ?? 25;
  }

  async fetch(): Promise<FetchResult> {
    return safeFetch(this.sourceId, async () => {
      const res = await fetch(this.listingUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; QuantMacroScanner/1.0; +macro-news-fetcher)" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Scrape fetch failed: ${this.sourceId} -> HTTP ${res.status}`);
      }
      const html = await res.text();
      const $ = cheerio.load(html);
      const { itemSelector, titleSelector, linkSelector, dateSelector, summarySelector } = this.selectors;
      const items: RawMacroNewsItem[] = [];
      $(itemSelector).slice(0, this.maxItems).each((_, el) => {
        const root = $(el);
        const headline = root.find(titleSelector).first().text().trim();
        const hrefRaw = root.find(linkSelector).first().attr("href") ?? "";
        if (!headline || !hrefRaw) return;
        const url = hrefRaw.startsWith("http") ? hrefRaw : `${this.baseUrl}${hrefRaw}`;
        const summary = summarySelector ? root.find(summarySelector).first().text().trim() : undefined;
        const dateText = dateSelector ? root.find(dateSelector).first().text().trim() : undefined;
        const content = `${headline} ${summary ?? ""}`;
        items.push({
          headline,
          summary,
          url,
          publishedAt: this.parseDate(dateText),
          sourceId: this.sourceId,
          sourceName: this.sourceName,
          scope: this.scope,
          rawImpact: classifyImpact(content),
          affectedSectors: classifySectors(content),
          type: this.inferType(headline),
        });
      });
      return items;
    });
  }

  private parseDate(dateText?: string): string {
    if (!dateText) return new Date().toISOString();
    const d = new Date(dateText);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  private inferType(headline: string): string {
    const h = headline.toLowerCase();
    if (/(lai suat|ngan hang nha nuoc|fed)/i.test(h)) return "Monetary";
    if (/(thue|ngan sach)/i.test(h)) return "Fiscal";
    if (/(xuat khau|fdi|thuong mai)/i.test(h)) return "Trade";
    if (/(loi nhuan|ket qua kinh doanh)/i.test(h)) return "Earnings";
    return "General";
  }
}