// CatalystEngine.ts
// Engine cho kiến trúc "radar quét & lan truyền": nguồn tin -> edge lan tác động -> ngành/mã.
// Engine không tự lấy dữ liệu giá/khối lượng/dòng tiền ngoại/định giá — các giá trị này được
// truyền vào qua MarketSignal (do các module dữ liệu thị trường của bạn cung cấp).

import {
  CatalystSource,
  ImpactEdge,
  MarketSignal,
  CalibrationEntry,
  AlertConfig,
  TriggeredAlert,
  PropagationDistance,
  Horizon,
} from "./types";

export interface TickerImpactCard {
  ticker: string;
  sourceId: string;
  sourceTitle: string;
  direction: "benefit" | "harm";
  netSignedImpact: number;
  propagationDistance: PropagationDistance;
  hopCount: number;
  horizon: Horizon;
  scheduled: boolean;
  daysRemaining: number | null;
  corroborationCount: number;
  historicalWinRate: number;
  priceInStatus: "reflected" | "not_reflected";
  volumeFlag: "confirmed" | "suspicious" | "none";
  foreignFlowDirection: "buy" | "sell" | "none";
  foreignFlowValue?: string;
  opportunityScore: number; // đã điều chỉnh thanh khoản + định giá tương đối
  isBestPickInGroup: boolean;
  isConflicted: boolean;
  isWatchlisted: boolean;
  compositeScore: number; // 0-100
}

export interface SectorRanking {
  sector: string;
  netScore: number;
  opportunityScore: number;
  tickerCount: number;
  isNew: boolean;
  primaryCards: TickerImpactCard[];
  cascadeCards: TickerImpactCard[];
}

export interface TopMoverEntry {
  rank: number;
  prevRank: number | null; // null = mới lọt top N so với lần quét trước
  ticker: string;
  label: string;
  compositeScore: number;
  isWatchlisted: boolean;
}

export interface EmergingSourceCard {
  sourceId: string;
  title: string;
  category: string;
  corroborationCount: number;
  affectedTargetCount: number;
}

const CONFIDENCE_BASE: Record<PropagationDistance, number> = {
  direct: 1.0,
  upstream: 0.5,
  downstream: 0.5,
  competitor: 0.5,
  commodity: 0.3,
};

const HOP_DECAY = 0.6; // mỗi bậc cascade thêm giảm độ tin cậy
const ANTICIPATION_WINDOW_DAYS = 30; // cửa sổ tích luỹ trước ngày thực thi
const RUMOR_WEIGHT = 0.5;

export class CatalystEngine {
  constructor(
    private sources: CatalystSource[],
    private edges: ImpactEdge[],
    private marketSignals: Map<string, MarketSignal>,
    private calibration: CalibrationEntry[],
    private previousRanks: Map<string, number> = new Map() // ticker -> hạng lần quét trước, để tính rank change
  ) {}

  private sourceById(id: string): CatalystSource | undefined {
    return this.sources.find((s) => s.id === id);
  }

  private confidenceMultiplier(edge: ImpactEdge): number {
    const base = CONFIDENCE_BASE[edge.propagationDistance];
    const hopPenalty = Math.pow(HOP_DECAY, edge.hopCount - 1);
    return base * hopPenalty;
  }

  // Tính impact hiện tại của 1 edge, xử lý cả 2 pha: retrospective (đã xảy ra) và scheduled (có lịch, đếm ngược)
  private calculateEdgeImpact(edge: ImpactEdge, source: CatalystSource, now: number): number {
    const confidence = this.confidenceMultiplier(edge);
    const credibilityWeight = source.sourceCredibility === "confirmed" ? 1 : RUMOR_WEIGHT;
    const sign = edge.direction === "benefit" ? 1 : -1;

    let magnitude: number;

    if (source.executionDate) {
      const execTime = source.executionDate.getTime();
      if (now < execTime) {
        // Pha tích luỹ: càng gần ngày thực thi, impact càng tăng
        const daysRemaining = (execTime - now) / (1000 * 3600 * 24);
        const progress = 1 - Math.min(1, daysRemaining / ANTICIPATION_WINDOW_DAYS);
        magnitude = edge.baseWeight * Math.max(0, progress);
      } else {
        // Pha giải toả: decay như bình thường kể từ ngày thực thi
        const daysSinceExec = (now - execTime) / (1000 * 3600 * 24);
        magnitude = edge.baseWeight * Math.exp(-edge.decayRate * daysSinceExec);
      }
    } else {
      // Retrospective thuần: decay kể từ ngày công bố
      const daysSincePublish = (now - source.publishedDate.getTime()) / (1000 * 3600 * 24);
      magnitude = edge.baseWeight * Math.exp(-edge.decayRate * Math.max(0, daysSincePublish));
    }

    return magnitude * confidence * credibilityWeight * sign;
  }

  private daysRemainingFor(source: CatalystSource, now: number): number | null {
    if (!source.executionDate) return null;
    const diff = (source.executionDate.getTime() - now) / (1000 * 3600 * 24);
    return diff > 0 ? diff : 0;
  }

  private getWinRate(category: string, propagationDistance: PropagationDistance): number {
    const entry = this.calibration.find(
      (c) => c.category === category && c.propagationDistance === propagationDistance
    );
    return entry?.historicalWinRate ?? 50; // mặc định trung lập nếu chưa có dữ liệu lịch sử
  }

  // Điểm tổng hợp 0-100 để quét nhanh, gộp mọi lớp tín hiệu
  private calculateCompositeScore(params: {
    absImpact: number;
    priceInStatus: "reflected" | "not_reflected";
    volumeFlag: "confirmed" | "suspicious" | "none";
    corroborationCount: number;
    winRate: number;
    foreignFlowDirection: "buy" | "sell" | "none";
    direction: "benefit" | "harm";
  }): number {
    let score = Math.min(50, params.absImpact * 5); // nền tảng từ độ mạnh catalyst

    if (params.priceInStatus === "not_reflected") score += 15;
    if (params.volumeFlag === "confirmed") score += 10;
    if (params.volumeFlag === "suspicious") score -= 8;

    score += Math.min(10, params.corroborationCount * 2.5);
    score += (params.winRate - 50) * 0.2;

    const flowAligned =
      (params.direction === "benefit" && params.foreignFlowDirection === "buy") ||
      (params.direction === "harm" && params.foreignFlowDirection === "sell");
    if (flowAligned) score += 8;
    else if (params.foreignFlowDirection !== "none") score -= 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // Xây danh sách TickerImpactCard cho 1 nhóm edge cùng targetType='ticker', áp cả peer ranking + conflict merge
  private buildTickerCards(edgesForTargetType: ImpactEdge[], now: number): TickerImpactCard[] {
    const byTicker = new Map<string, ImpactEdge[]>();
    for (const e of edgesForTargetType) {
      const list = byTicker.get(e.targetId) ?? [];
      list.push(e);
      byTicker.set(e.targetId, list);
    }

    const cards: TickerImpactCard[] = [];

    for (const [ticker, edgeList] of byTicker.entries()) {
      // Gộp mọi edge trỏ vào cùng 1 mã -> phát hiện xung đột nếu có cả benefit và harm
      let netSignedImpact = 0;
      const signs = new Set<string>();
      for (const e of edgeList) {
        const source = this.sourceById(e.sourceId);
        if (!source) continue;
        netSignedImpact += this.calculateEdgeImpact(e, source, now);
        signs.add(e.direction);
      }
      const isConflicted = signs.size > 1;

      // Lấy edge chi tiết mạnh nhất để hiển thị nhãn chính (edge có |impact| lớn nhất)
      const primaryEdge = edgeList.reduce((best, e) => {
        const source = this.sourceById(e.sourceId);
        if (!source) return best;
        const impact = Math.abs(this.calculateEdgeImpact(e, source, now));
        const bestSource = this.sourceById(best.sourceId);
        const bestImpact = bestSource ? Math.abs(this.calculateEdgeImpact(best, bestSource, now)) : -1;
        return impact > bestImpact ? e : best;
      }, edgeList[0]);

      const source = this.sourceById(primaryEdge.sourceId);
      if (!source) continue;

      const signal = this.marketSignals.get(ticker);
      const winRate = this.getWinRate(source.category, primaryEdge.propagationDistance);
      const direction: "benefit" | "harm" = netSignedImpact >= 0 ? "benefit" : "harm";

      const compositeScore = this.calculateCompositeScore({
        absImpact: Math.abs(netSignedImpact),
        priceInStatus: signal?.priceInStatus ?? "not_reflected",
        volumeFlag: signal?.volumeFlag ?? "none",
        corroborationCount: source.corroborationCount,
        winRate,
        foreignFlowDirection: signal?.foreignFlowDirection ?? "none",
        direction,
      });

      // Điểm cơ hội: net impact điều chỉnh theo định giá tương đối (rẻ hơn -> tốt hơn) và thanh khoản
      const valuationAdj = 1 - (signal?.valuationPercentile ?? 0.5); // percentile thấp -> valuationAdj cao
      const liquidityAdj = signal?.liquidityScore ?? 0.5;
      const opportunityScore = netSignedImpact * (0.5 + 0.5 * valuationAdj) * (0.5 + 0.5 * liquidityAdj);

      cards.push({
        ticker,
        sourceId: source.id,
        sourceTitle: source.title,
        direction,
        netSignedImpact,
        propagationDistance: primaryEdge.propagationDistance,
        hopCount: primaryEdge.hopCount,
        horizon: primaryEdge.horizon,
        scheduled: !!source.executionDate && now < source.executionDate.getTime(),
        daysRemaining: this.daysRemainingFor(source, now),
        corroborationCount: source.corroborationCount,
        historicalWinRate: winRate,
        priceInStatus: signal?.priceInStatus ?? "not_reflected",
        volumeFlag: signal?.volumeFlag ?? "none",
        foreignFlowDirection: signal?.foreignFlowDirection ?? "none",
        foreignFlowValue: signal?.foreignFlowValue,
        opportunityScore,
        isBestPickInGroup: false, // gán ở bước sau, theo nhóm cùng sourceId
        isConflicted,
        isWatchlisted: signal?.isWatchlisted ?? false,
        compositeScore,
      });
    }

    // Peer ranking: trong mỗi nhóm cùng sourceId, đánh dấu "lựa chọn tốt nhất" theo opportunityScore
    const bySource = new Map<string, TickerImpactCard[]>();
    for (const c of cards) {
      const list = bySource.get(c.sourceId) ?? [];
      list.push(c);
      bySource.set(c.sourceId, list);
    }
    for (const group of bySource.values()) {
      if (group.length < 2) continue;
      const best = group.reduce((a, b) =>
        Math.abs(b.opportunityScore) > Math.abs(a.opportunityScore) ? b : a
      );
      best.isBestPickInGroup = true;
    }

    return cards.sort((a, b) => Math.abs(b.netSignedImpact) - Math.abs(a.netSignedImpact));
  }

  // Xếp hạng ngành, mỗi ngành kèm danh sách mã bậc 1 và bậc 2 (cascade)
  public getSectorRankings(): SectorRanking[] {
    const now = Date.now();
    const sectorEdges = this.edges.filter((e) => e.targetType === "sector");
    const sectors = Array.from(new Set(sectorEdges.map((e) => e.targetId)));

    // Với mỗi ngành, tìm các mã liên quan qua edge targetType='ticker' mà source cũng lan tới ngành đó
    const results: SectorRanking[] = [];

    for (const sector of sectors) {
      const edgesForSector = sectorEdges.filter((e) => e.targetId === sector);
      let netScore = 0;
      let isNew = false;

      for (const e of edgesForSector) {
        const source = this.sourceById(e.sourceId);
        if (!source) continue;
        netScore += this.calculateEdgeImpact(e, source, now);
        const detectedHoursAgo = (now - source.firstDetectedAt.getTime()) / (1000 * 3600);
        if (detectedHoursAgo <= 2) isNew = true;
      }

      const sourceIds = new Set(edgesForSector.map((e) => e.sourceId));
      const tickerEdges = this.edges.filter(
        (e) => e.targetType === "ticker" && sourceIds.has(e.sourceId) && e.hopCount === 1
      );
      const cascadeEdges = this.edges.filter(
        (e) => e.targetType === "ticker" && sourceIds.has(e.sourceId) && e.hopCount === 2
      );

      const primaryCards = this.buildTickerCards(tickerEdges, now);
      const cascadeCards = this.buildTickerCards(cascadeEdges, now);

      const opportunityScore =
        primaryCards.reduce((sum, c) => sum + c.opportunityScore, 0) / (primaryCards.length || 1);

      results.push({
        sector,
        netScore,
        opportunityScore,
        tickerCount: primaryCards.length,
        isNew,
        primaryCards,
        cascadeCards,
      });
    }

    return results.sort((a, b) => b.netScore - a.netScore);
  }

  // Top N mã tăng/giảm mạnh nhất trực tiếp, không nhóm theo ngành, kèm biến động thứ hạng
  public getTopMovers(direction: "benefit" | "harm", limit = 10): TopMoverEntry[] {
    const now = Date.now();
    const tickerEdges = this.edges.filter((e) => e.targetType === "ticker");
    const allCards = this.buildTickerCards(tickerEdges, now).filter((c) => c.direction === direction);

    const sorted = allCards.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, limit);

    return sorted.map((c, i) => {
      const rank = i + 1;
      const prevRank = this.previousRanks.get(c.ticker) ?? null;
      return {
        rank,
        prevRank,
        ticker: c.ticker,
        label: c.sourceTitle,
        compositeScore: c.compositeScore,
        isWatchlisted: c.isWatchlisted,
      };
    });
  }

  // Nguồn tin vừa phát hiện gần đây (theo firstDetectedAt), dùng cho dải "Vừa phát hiện"
  public getEmergingSources(withinMinutes = 120): EmergingSourceCard[] {
    const now = Date.now();
    return this.sources
      .filter((s) => (now - s.firstDetectedAt.getTime()) / 60000 <= withinMinutes)
      .map((s) => ({
        sourceId: s.id,
        title: s.title,
        category: s.category,
        corroborationCount: s.corroborationCount,
        affectedTargetCount: this.edges.filter((e) => e.sourceId === s.id).length,
      }));
  }

  // Cảnh báo theo ngưỡng người dùng tự đặt
  public getActiveAlerts(config: AlertConfig): TriggeredAlert[] {
    const alerts: TriggeredAlert[] = [];
    const sectorRankings = this.getSectorRankings();

    for (const s of sectorRankings) {
      if (Math.abs(s.netScore) >= config.minSectorNetScore) {
        alerts.push({
          type: "sector_threshold",
          targetId: s.sector,
          message: `Ngành ${s.sector} đã vượt ngưỡng net score (${s.netScore.toFixed(1)})`,
        });
      }
    }

    const now = Date.now();
    for (const source of this.sources) {
      if (!source.executionDate) continue;
      const daysRemaining = (source.executionDate.getTime() - now) / (1000 * 3600 * 24);
      if (daysRemaining > 0 && daysRemaining <= config.maxDaysBeforeExecutionForAlert) {
        alerts.push({
          type: "execution_window",
          targetId: source.id,
          message: `"${source.title}" sắp thực thi trong ${Math.round(daysRemaining)} ngày`,
        });
      }
      if (source.corroborationCount < config.minCorroborationCount) {
        alerts.push({
          type: "low_corroboration_warning",
          targetId: source.id,
          message: `"${source.title}" chỉ có ${source.corroborationCount} nguồn xác nhận — dưới ngưỡng tối thiểu`,
        });
      }
    }

    return alerts;
  }
}