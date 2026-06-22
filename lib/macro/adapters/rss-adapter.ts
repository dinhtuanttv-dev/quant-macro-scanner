import { XMLParser } from "fast-xml-parser";
import type { MacroNewsAdapter } from "./base";
import { safeFetch } from "./base";
import type { FetchResult, MacroScope, MacroSourceId, RawMacroNewsItem } from "../types";
import { classifyImpact, classifySectors } from "../classifier";

interface RssAdapterConfig {
  sourceId: MacroSourceId;
  sourceName: string;
  feedUrl: string;
  scope: MacroScope;
  maxItems?: number;
}

export class RssMacroNewsAdapter implements MacroNewsAdapter {
  readonly sourceId: MacroSourceId;
  readonly sourceName: string;
  private readonly feedUrl: string;
  private readonly scope: MacroScope;
  private readonly maxItems: number;
  private readonly parser: XMLParser;

  constructor(config: RssAdapterConfig) {
    this.sourceId = config.sourceId;
    this.sourceName = config.sourceName;
    this.feedUrl = config.feedUrl;
    this.scope = config.scope;
    this.maxItems = config.maxItems ?? 30;
    this.parser = new XMLParser({ ignoreAttributes: false });
  }

  async fetch(): Promise<FetchResult> {
    return safeFetch(this.sourceId, async () => {
      const res = await fetch(this.feedUrl, {
        headers: { "User-Agent": "QuantMacroScanner/1.0 (+macro-news-fetcher)" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`RSS fetch failed: ${this.sourceId} -> HTTP ${res.status}`);
      }
      const xml = await res.text();
      const parsed = this.parser.parse(xml);
      const rawItems: any[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      return items.slice(0, this.maxItems).map((item) => this.normalize(item));
    });
  }

  private normalize(item: any): RawMacroNewsItem {
    const headline: string = item.title?.["#text"] ?? item.title ?? "(no title)";
    const summary: string | undefined = item.description ?? item.summary?.["#text"];
    const url: string = item.link?.["@_href"] ?? item.link ?? item.guid ?? "";
    const pubDateRaw: string = item.pubDate ?? item.published ?? item.updated ?? "";
    const publishedAt = this.toIso(pubDateRaw);
    const affectedSectors = classifySectors(`${headline} ${summary ?? ""}`);
    const rawImpact = classifyImpact(`${headline} ${summary ?? ""}`);
    return {
      headline: this.stripCdata(headline),
      summary: summary ? this.stripCdata(summary) : undefined,
      url,
      publishedAt,
      sourceId: this.sourceId,
      sourceName: this.sourceName,
      scope: this.scope,
      rawImpact,
      affectedSectors,
      type: this.inferType(headline),
    };
  }

  private toIso(dateStr: string): string {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  private stripCdata(s: string): string {
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  }

  private inferType(headline: string): string {
    const h = headline.toLowerCase();
    if (/(fed|lai suat|rate hike|fomc)/i.test(h)) return "Monetary";
    if (/(thue|tax|fiscal|ngan sach)/i.test(h)) return "Fiscal";
    if (/(chien tranh|war|sanction|geopolit)/i.test(h)) return "Geopolitical";
    if (/(loi nhuan|earnings|ket qua kinh doanh)/i.test(h)) return "Earnings";
    return "General";
  }
}