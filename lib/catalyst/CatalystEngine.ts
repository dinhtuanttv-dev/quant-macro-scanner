// CatalystEngine.ts — PHASE 1 + 2 + 3 UPGRADE (bản tích lũy đầy đủ)
// Phase 1: EdgeIndex, computeTrustScore, searchTickerImpact
// Phase 2: computeCredibilityWeight (đường cong hội tụ liên tục)
// Phase 3: computeFreshnessScore (thay isNew nhị phân bằng điểm liên tục)

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
import { EdgeIndex } from "./engine/EdgeIndex";
import { computeTrustScore } from "./engine/computeTrustScore";
import { computeCredibilityWeight } from "./engine/computeCredibilityWeight";
import { computeFreshnessScore, isConsideredNew } from "./engine/computeFreshnessScore"; // ★PHASE 3

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
  trustScore: number;
}

export interface SectorRanking {
  sector: string;
  netScore: number;
  opportunityScore: number;
  tickerCount: number;
  isNew: boolean;          // giữ lại để tương thích ngược
  freshnessScore: number;  // ★PHASE 3: 0-1, liên tục, thay thế isNew về lâu dài
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

export class CatalystEngine {
  private index: EdgeIndex | null = null;

  constructor(
    private sources: CatalystSource[],
    private edges: ImpactEdge[],
    private marketSignals: Map<string, MarketSignal>,
    private calibration: CalibrationEntry[],
    private previousRanks: Map<string, number> = new Map()
  ) {}

  private getIndex(): EdgeIndex {
    if (!this.index) this.index = new EdgeIndex(this.edges);
    return this.index;
  }

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
    const credibilityWeight = computeCredibilityWeight(source.sourceCredibility, source.corroborationCount);
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

      const trustScore = computeTrustScore({
        corroborationCount: source.corroborationCount,
        sourceCredibility: source.sourceCredibility,
        firstDetectedAt: source.firstDetectedAt,
      });

      const valuationAdj = 1 - (signal?.valuationPercentile ?? 0.5);
      const liquidityAdj = signal?.liquidityScore ?? 0.5;
      const opportunityScore = netSignedImpact * (0.5 + 0.5 * valuationAdj) * (0.5 + 0.5 * liquidityAdj);

      cards.push({
        ticker, sourceId: source.id, sourceTitle: source.title, direction, netSignedImpact,
        propagationDistance: primaryEdge.propagationDistance, hopCount: primaryEdge.hopCount,
        horizon: primaryEdge.horizon,
        scheduled: !!source.executionDate && now < source.executionDate.getTime(),
        daysRemaining: this.daysRemainingFor(source, now),
        corroborationCount: source.corroborationCount, historicalWinRate: winRate,
        priceInStatus: signal?.priceInStatus ?? "not_reflected",
        volumeFlag: signal?.volumeFlag ?? "none",
        foreignFlowDirection: signal?.foreignFlowDirection ?? "none",
        foreignFlowValue: signal?.foreignFlowValue,
        opportunityScore, isBestPickInGroup: false, isConflicted,
        isWatchlisted: signal?.isWatchlisted ?? false, compositeScore, trustScore,
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
      const best = group.reduce((a, b) => Math.abs(b.opportunityScore) > Math.abs(a.opportunityScore) ? b : a);
      best.isBestPickInGroup = true;
    }

    return cards.sort((a, b) => Math.abs(b.netSignedImpact) - Math.abs(a.netSignedImpact));
  }

  public getSectorRankings(): SectorRanking[] {
    const now = Date.now();
    const index = this.getIndex();
    const sectors = index.getAllSectors();
    const results: SectorRanking[] = [];

    for (const sector of sectors) {
      const edgesForSector = index.getBySector(sector);
      let netScore = 0;
      let isNew = false;
      let maxFreshness = 0; // ★PHASE 3: freshness cao nhất trong các nguồn của ngành này

      for (const e of edgesForSector) {
        const source = this.sourceById(e.sourceId);
        if (!source) continue;
        netScore += this.calculateEdgeImpact(e, source, now);
        if (isConsideredNew(source.firstDetectedAt)) isNew = true;
        const freshness = computeFreshnessScore(source.firstDetectedAt);
        if (freshness > maxFreshness) maxFreshness = freshness;
      }

      const sourceIds = new Set(edgesForSector.map((e) => e.sourceId));
      const tickerEdges: ImpactEdge[] = [];
      const cascadeEdges: ImpactEdge[] = [];
      for (const sourceId of sourceIds) {
        const edgesOfSource = index.getBySourceId(sourceId);
        for (const e of edgesOfSource) {
          if (e.targetType !== "ticker") continue;
          if (e.hopCount === 1) tickerEdges.push(e);
          else if (e.hopCount === 2) cascadeEdges.push(e);
        }
      }

      const primaryCards = this.buildTickerCards(tickerEdges, now);
      const cascadeCards = this.buildTickerCards(cascadeEdges, now);
      const opportunityScore =
        primaryCards.reduce((sum, c) => sum + c.opportunityScore, 0) / (primaryCards.length || 1);

      results.push({
        sector, netScore, opportunityScore, tickerCount: primaryCards.length,
        isNew, freshnessScore: Math.round(maxFreshness * 1000) / 1000,
        primaryCards, cascadeCards,
      });
    }

    return results.sort((a, b) => b.netScore - a.netScore);
  }

  public getTopMovers(direction: "benefit" | "harm", limit = 10): TopMoverEntry[] {
    const now = Date.now();
    const index = this.getIndex();
    const allTickers = index.getAllTickers();
    const tickerEdges: ImpactEdge[] = [];
    for (const ticker of allTickers) tickerEdges.push(...index.getByTicker(ticker));

    const allCards = this.buildTickerCards(tickerEdges, now).filter((c) => c.direction === direction);
    const sorted = allCards.sort((a, b) => b.compositeScore - a.compositeScore).slice(0, limit);

    return sorted.map((c, i) => ({
      rank: i + 1, prevRank: this.previousRanks.get(c.ticker) ?? null,
      ticker: c.ticker, label: c.sourceTitle, compositeScore: c.compositeScore,
      isWatchlisted: c.isWatchlisted,
    }));
  }

  public getEmergingSources(withinMinutes = 120): EmergingSourceCard[] {
    const now = Date.now();
    const index = this.getIndex();
    return this.sources
      .filter((s) => (now - s.firstDetectedAt.getTime()) / 60000 <= withinMinutes)
      .map((s) => ({
        sourceId: s.id, title: s.title, category: s.category,
        corroborationCount: s.corroborationCount,
        affectedTargetCount: index.getBySourceId(s.id).length,
      }));
  }

  public getActiveAlerts(config: AlertConfig): TriggeredAlert[] {
    const alerts: TriggeredAlert[] = [];
    const sectorRankings = this.getSectorRankings();

    for (const s of sectorRankings) {
      if (Math.abs(s.netScore) >= config.minSectorNetScore) {
        alerts.push({
          type: "sector_threshold", targetId: s.sector,
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
          type: "execution_window", targetId: source.id,
          message: `"${source.title}" sap thuc thi trong ${Math.round(daysRemaining)} ngay`,
        });
      }
      if (source.corroborationCount < config.minCorroborationCount) {
        alerts.push({
          type: "low_corroboration_warning", targetId: source.id,
          message: `"${source.title}" chi co ${source.corroborationCount} nguon xac nhan - duoi nguong toi thieu`,
        });
      }
    }

    return alerts;
  }

  public getUpcomingMacroEvents(limit = 5): MacroEventSummary[] {
    const now = Date.now();
    const index = this.getIndex();
    const upcoming = this.sources
      .filter((s) => s.executionDate && s.executionDate.getTime() > now)
      .map((s) => {
        const daysRemaining = (s.executionDate!.getTime() - now) / (1000 * 3600 * 24);
        const sourceEdges = index.getBySourceId(s.id);
        const netImpact = sourceEdges.reduce((sum, e) => sum + this.calculateEdgeImpact(e, s, now), 0);
        return {
          sourceId: s.id, title: s.title, executionDate: s.executionDate!.toISOString(),
          daysRemaining: Math.round(daysRemaining * 10) / 10,
          direction: (netImpact >= 0 ? "benefit" : "harm") as "benefit" | "harm",
          category: s.category,
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
    return upcoming.slice(0, limit);
  }

  public getImpactForTicker(ticker: string): TickerImpactResult {
    const now = Date.now();
    const index = this.getIndex();
    const edgesForTicker = index.getByTicker(ticker);
    if (edgesForTicker.length === 0) return { direction: "none", compositeScore: 0 };
    const cards = this.buildTickerCards(edgesForTicker, now);
    const card = cards.find((c) => c.ticker === ticker);
    if (!card) return { direction: "none", compositeScore: 0 };
    return { direction: card.direction, compositeScore: card.compositeScore };
  }

  public getImpactForTickers(tickers: string[]): Record<string, TickerImpactResult> {
    const now = Date.now();
    const index = this.getIndex();
    const edgesByTicker = index.getByTickers(tickers);
    const result: Record<string, TickerImpactResult> = {};
    for (const ticker of tickers) {
      const edges = edgesByTicker.get(ticker) ?? [];
      if (edges.length === 0) { result[ticker] = { direction: "none", compositeScore: 0 }; continue; }
      const cards = this.buildTickerCards(edges, now);
      const card = cards.find((c) => c.ticker === ticker);
      result[ticker] = card
        ? { direction: card.direction, compositeScore: card.compositeScore }
        : { direction: "none", compositeScore: 0 };
    }
    return result;
  }

  public searchTickerImpact(query: string, limit = 10): TickerImpactCard[] {
    const now = Date.now();
    const index = this.getIndex();
    const matchedTickers = index.searchTickersByPrefix(query, limit);
    const edges: ImpactEdge[] = [];
    for (const ticker of matchedTickers) edges.push(...index.getByTicker(ticker));
    return this.buildTickerCards(edges, now);
  }
}
