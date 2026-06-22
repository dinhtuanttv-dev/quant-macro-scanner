export type MacroScope = "Domestic" | "Global";
export type MacroSourceId = "cafef" | "vietstock" | "ndh" | "investing" | "reuters" | "bloomberg" | "manual";
export type MacroSeverity = "low" | "medium" | "high" | "critical";

export interface RawMacroNewsItem {
  headline: string;
  summary?: string;
  url: string;
  publishedAt: string;
  sourceId: MacroSourceId;
  sourceName: string;
  scope: MacroScope;
  rawImpact: number;
  affectedSectors: string[];
  relatedTickers?: string[];
  type: string;
}

export interface FetchResult {
  sourceId: MacroSourceId;
  items: RawMacroNewsItem[];
  fetchedAt: string;
  success: boolean;
  error?: string;
}