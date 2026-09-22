// PORT TRUC TIEP tu universe.py (Phan XI-BIS v3.1 - Universe Selection
// Layer). Universe uu tien CHI dung de doi THU TU hien thi
// (priorityRankBoost), TUYET DOI khong cong vao Score_normalized.
export interface UniverseResult { universe: string[]; doubleHit: string[]; sourceAOnly: string[]; sourceBOnly: string[]; }

export function buildPriorityUniverse(patternScannerTop: string[], confluenceFilterTop: string[], topN = 30): UniverseResult {
  const setA = new Set(patternScannerTop.slice(0, topN));
  const setB = new Set(confluenceFilterTop.slice(0, topN));
  const doubleHit = [...setA].filter((t) => setB.has(t)).sort();
  const onlyA = [...setA].filter((t) => !setB.has(t)).sort();
  const onlyB = [...setB].filter((t) => !setA.has(t)).sort();
  return { universe: [...doubleHit, ...onlyA, ...onlyB], doubleHit, sourceAOnly: onlyA, sourceBOnly: onlyB };
}

export function priorityRankBoost(ticker: string, universe: UniverseResult): number {
  if (universe.doubleHit.includes(ticker)) return 2;
  if (universe.sourceAOnly.includes(ticker) || universe.sourceBOnly.includes(ticker)) return 1;
  return 0;
}
