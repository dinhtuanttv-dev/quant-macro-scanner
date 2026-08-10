// CatalystEngine.ts
// Engine cho kien truc "radar quet & lan truyen": nguon tin -> edge lan tac dong -> nganh/ma.
// Da them 2 method moi cho Tab Sieu Quet AI 2.0: getUpcomingMacroEvents(), getImpactForTicker().

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
import type { MacroEventSummary, TickerImpactResult } from "../types/siu-quet-ai";

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
  opportunityScore: number;
  isBestPickInGroup: boolean;
  isConflicted: boolean;
  isWatchlisted: boolean;
  compositeScore: number;
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
  prevRank: number | null;
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

const HOP_DECAY = 0.6;
const ANTICIPATION_WINDOW_DAYS = 30;
const RUMOR_WEIGHT = 0.5;

export class CatalystEngine {
  constructor(
    private sources: CatalystSource[],
    private edges: ImpactEdge[],
    private marketSignals: Map<string, MarketSignal>,
    private calibration: CalibrationEntry[],
    private previousRanks: Map<string, number> = new Map()
  ) {}

  private sourceById(id: string): CatalystSource | undefined {
    return this.sources.find((s) => s.id === id);
  }

  private confidenceMultiplier(edge: ImpactEdge): number {
    const base = CONFIDENCE_BASE[edge.propagationDistance];
    const hopPenalty = Math.pow(HOP_DECAY, edge.hopCount - 1);
    return base * hopPenalty;
  }

  private calculateEdgeImpact(edge: ImpactEdge, source: CatalystSource, now: number): number {
    const confidence = this.confidenceMultiplier(edge);
    const credibilityWeight = source.sourceCredibility === "confirmed" ? 1 : RUMOR_WEIGHT;
    const sign = edge.direction === "benefit" ? 1 : -1;

    let magnitude: number;

    if (source.executionDate) {
      const execTime = source.executionDate.getTime();
      if (now < execTime) {
        const daysRemaining = (execTime - now) / (1000 * 3600 * 24);
        const progress = 1 - Math.min(1, daysRemaining / ANTICIPATION_WINDOW_DAYS);
        magnitude = edge.baseWeight * Math.max(0, progress);
      } else {
        const daysSinceExec = (now - execTime) / (1000 * 3600 * 24);
        magnitude = edge.baseWeight * Math.exp(-edge.decayRate * daysSinceExec);
      }
    } else {
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
    return entry?.historicalWinRate ?? 50;
  }

  private calculateCompositeScore(params: {
    absImpact: number;
    priceInStatus: "reflected" | "not_reflected";
    volumeFlag: "confirmed" | "suspicious" | "none";
    corroborationCount: number;
    winRate: number;
    foreignFlowDirection: "buy" | "sell" | "none";
    direction: "benefit" | "harm";
  }): number {
    let score = Math.min(50, params.absImpact * 5);

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

  private buildTickerCards(edgesForTargetType: ImpactEdge[], now: number): TickerImpactCard[] {
    const byTicker = new Map<string, ImpactEdge[]>();
    for (const e of edgesForTargetType) {
      const list = byTicker.get(e.targetId) ?? [];
      list.push(e);
      byTicker.set(e.targetId, list);
    }

    const cards: TickerImpactCard[] = [];

    for (const [ticker, edgeList] of byTicker.entries()) {
      let netSignedImpact = 0;
      const signs = new Set<string>();
      for (const e of edgeList) {
        const source = this.sourceById(e.sourceId);
        if (!source) continue;
        netSignedImpact += this.calculateEdgeImpact(e, source, now);
        signs.add(e.direction);
      }
      const isConflicted = signs.size > 1;

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

      const valuationAdj = 1 - (signal?.valuationPercentile ?? 0.5);
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
        isBestPickInGroup: false,
        isConflicted,
        isWatchlisted: signal?.isWatchlisted ?? false,
        compositeScore,
      });
    }

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

  public getSectorRankings(): SectorRanking[] {
    const now = Date.now();
    const sectorEdges = this.edges.filter((e) => e.targetType === "sector");
    const sectors = Array.from(new Set(sectorEdges.map((e) => e.targetId)));

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

  public getActiveAlerts(config: AlertConfig): TriggeredAlert[] {
    const alerts: TriggeredAlert[] = [];
    const sectorRankings = this.getSectorRankings();

    for (const s of sectorRankings) {
      if (Math.abs(s.netScore) >= config.minSectorNetScore) {
        alerts.push({
          type: "sector_threshold",
          targetId: s.sector,
          message: `Nganh ${s.sector} da vuot nguong net score (${s.netScore.toFixed(1)})`,
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
          message: `"${source.title}" sap thuc thi trong ${Math.round(daysRemaining)} ngay`,
        });
      }
      if (source.corroborationCount < config.minCorroborationCount) {
        alerts.push({
          type: "low_corroboration_warning",
          targetId: source.id,
          message: `"${source.title}" chi co ${source.corroborationCount} nguon xac nhan - duoi nguong toi thieu`,
        });
      }
    }

    return alerts;
  }

  // ===================== METHOD MOI CHO TAB SIEU QUET AI 2.0 =====================

  // Danh sach su kien vi mo sap thuc thi (executionDate trong tuong lai), sort theo gan nhat.
  // Dung cho UniversalCountdown + ActiveEventsRow o Command Bar.
  public getUpcomingMacroEvents(limit = 5): MacroEventSummary[] {
    const now = Date.now();

    const upcoming = this.sources
      .filter((s) => s.executionDate && s.executionDate.getTime() > now)
      .map((s) => {
        const daysRemaining = (s.executionDate!.getTime() - now) / (1000 * 3600 * 24);

        // Suy ra direction tong hop tu cac edge cua source nay (giong logic getDivergenceSignal cu)
        const sourceEdges = this.edges.filter((e) => e.sourceId === s.id);
        const netImpact = sourceEdges.reduce((sum, e) => sum + this.calculateEdgeImpact(e, s, now), 0);
        const direction: "benefit" | "harm" = netImpact >= 0 ? "benefit" : "harm";

        return {
          sourceId: s.id,
          title: s.title,
          executionDate: s.executionDate!.toISOString(),
          daysRemaining: Math.round(daysRemaining * 10) / 10,
          direction,
          category: s.category,
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    return upcoming.slice(0, limit);
  }

  // Tac dong catalyst hien tai toi 1 ma cu the -> dung cho cot "Event Impact" trong Tang1Table.
  // Neu ma khong co catalyst nao lien quan, tra ve direction "none", compositeScore 0.
  public getImpactForTicker(ticker: string): TickerImpactResult {
    const now = Date.now();
    const edgesForTicker = this.edges.filter((e) => e.targetType === "ticker" && e.targetId === ticker);

    if (edgesForTicker.length === 0) {
      return { direction: "none", compositeScore: 0 };
    }

    const cards = this.buildTickerCards(edgesForTicker, now);
    const card = cards.find((c) => c.ticker === ticker);

    if (!card) return { direction: "none", compositeScore: 0 };

    return { direction: card.direction, compositeScore: card.compositeScore };
  }

  // Ban hang loat cua getImpactForTicker() - tranh N+1 khi can tra cuu nhieu ma cung luc
  // (vd 20 ma trong bang Top 20). Chi duyet edges 1 lan thay vi goi lai N lan.
  public getImpactForTickers(tickers: string[]): Record<string, TickerImpactResult> {
    const now = Date.now();
    const tickerSet = new Set(tickers);
    const edgesForTickers = this.edges.filter(
      (e) => e.targetType === "ticker" && tickerSet.has(e.targetId)
    );

    const cards = this.buildTickerCards(edgesForTickers, now);
    const cardByTicker = new Map(cards.map((c) => [c.ticker, c]));

    const result: Record<string, TickerImpactResult> = {};
    for (const ticker of tickers) {
      const card = cardByTicker.get(ticker);
      result[ticker] = card
        ? { direction: card.direction, compositeScore: card.compositeScore }
        : { direction: "none", compositeScore: 0 };
    }
    return result;
  }
}
