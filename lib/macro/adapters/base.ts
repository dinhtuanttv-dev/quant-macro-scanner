import type { FetchResult, MacroSourceId } from "../types";

export interface MacroNewsAdapter {
  readonly sourceId: MacroSourceId;
  readonly sourceName: string;
  fetch(): Promise<FetchResult>;
}

export async function safeFetch(
  sourceId: MacroSourceId,
  fn: () => Promise<FetchResult["items"]>
): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const items = await fn();
    return { sourceId, items, fetchedAt, success: true };
  } catch (err) {
    return {
      sourceId,
      items: [],
      fetchedAt,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}