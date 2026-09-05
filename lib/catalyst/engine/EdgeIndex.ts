// lib/catalyst/engine/EdgeIndex.ts
//
// Multi-index Map O(1) cho ImpactEdge[], dùng ky thuat LAZY INITIALIZATION:
// khong build index ngay khi khoi tao (constructor rat re, chi luu tham chieu
// mang edges), CHI build 3 Map mot lan duy nhat khi lan dau co truy van thuc su
// (ensureBuilt() tu kiem tra co the goi lai nhieu lan an toan - idempotent).
//
// Ly do dung Lazy Init thay vi Eager (build ngay trong constructor):
// - CatalystEngine co the duoc khoi tao o nhieu noi (route test, cron, unit test)
//   ma khong phai lan nao cung goi het moi method -> tranh build index thua khi
//   khong can dung toi (vd chi goi getEmergingSources() thi khong can index edges).
// - Neu edges rong (truong hop het du lieu), khong ton chi phi build 3 Map rong.
//
// Do phuc tap: build 1 lan O(E) voi E = so luong edge. Sau do moi lookup O(1).
// So voi cach cu (buildTickerCards() filter() lai tu dau moi lan goi = O(E) MOI LAN),
// day la cai thien tu O(E x K) xuong O(E + K) voi K = so lan goi lookup trong 1 scan.

import type { ImpactEdge } from "../types";

export class EdgeIndex {
  private byTicker: Map<string, ImpactEdge[]> | null = null;
  private bySector: Map<string, ImpactEdge[]> | null = null;
  private bySourceId: Map<string, ImpactEdge[]> | null = null;

  constructor(private readonly edges: ImpactEdge[]) {}

  // Idempotent: goi nhieu lan chi build dung 1 lan (kiem tra byTicker !== null)
  private ensureBuilt(): void {
    if (this.byTicker !== null) return;

    const byTicker = new Map<string, ImpactEdge[]>();
    const bySector = new Map<string, ImpactEdge[]>();
    const bySourceId = new Map<string, ImpactEdge[]>();

    for (const edge of this.edges) {
      // Index theo targetType (ticker hoac sector)
      const targetMap = edge.targetType === "ticker" ? byTicker : bySector;
      const targetList = targetMap.get(edge.targetId);
      if (targetList) {
        targetList.push(edge);
      } else {
        targetMap.set(edge.targetId, [edge]);
      }

      // Index theo sourceId (dung cho dedup + truy nguoc nguon)
      const sourceList = bySourceId.get(edge.sourceId);
      if (sourceList) {
        sourceList.push(edge);
      } else {
        bySourceId.set(edge.sourceId, [edge]);
      }
    }

    this.byTicker = byTicker;
    this.bySector = bySector;
    this.bySourceId = bySourceId;
  }

  public getByTicker(ticker: string): ImpactEdge[] {
    this.ensureBuilt();
    return this.byTicker!.get(ticker) ?? [];
  }

  public getBySector(sector: string): ImpactEdge[] {
    this.ensureBuilt();
    return this.bySector!.get(sector) ?? [];
  }

  public getBySourceId(sourceId: string): ImpactEdge[] {
    this.ensureBuilt();
    return this.bySourceId!.get(sourceId) ?? [];
  }

  // Lay nhieu ticker cung luc, dung cho getImpactForTickers() batch -
  // van la O(1) x N (N = so ticker can tra cuu), khong duyet lai edges.
  public getByTickers(tickers: string[]): Map<string, ImpactEdge[]> {
    this.ensureBuilt();
    const result = new Map<string, ImpactEdge[]>();
    for (const ticker of tickers) {
      result.set(ticker, this.byTicker!.get(ticker) ?? []);
    }
    return result;
  }

  public getAllTickers(): string[] {
    this.ensureBuilt();
    return Array.from(this.byTicker!.keys());
  }

  public getAllSectors(): string[] {
    this.ensureBuilt();
    return Array.from(this.bySector!.keys());
  }

  // Prefix search cho Instant Impact Search - tim moi ticker bat dau bang query.
  // Van O(T) voi T = so ticker duy nhat (thuong <200), khong phai O(E) - vi da
  // co san danh sach key cua Map, khong can duyet lai toan bo edges.
  public searchTickersByPrefix(query: string, limit = 10): string[] {
    this.ensureBuilt();
    const upperQuery = query.trim().toUpperCase();
    if (!upperQuery) return [];

    const matches: string[] = [];
    for (const ticker of this.byTicker!.keys()) {
      if (ticker.startsWith(upperQuery)) {
        matches.push(ticker);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }
}
