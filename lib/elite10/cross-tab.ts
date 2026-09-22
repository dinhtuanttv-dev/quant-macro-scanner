// PORT TRUC TIEP tu cross_tab.py (Phan 2.3 - hoi tu cheo). Dem so trong
// 6 tab ma ticker lot Top-N cua CHINH tab do.
export const ALL_TABS = ["core", "macro", "sector", "ta", "catalyst", "dividend"];

export function crossTabConvergence(ticker: string, getTopN: (tab: string, n: number) => string[], topN = 20): { count: number; matched: string[] } {
  const matched = ALL_TABS.filter((tab) => getTopN(tab, topN).includes(ticker));
  return { count: matched.length, matched };
}
