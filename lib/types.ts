// ============ CORE DOMAIN TYPES ============

export interface TickerItem {
  name: string;
  value: number;
  change: number;
  prefix?: string;
  suffix?: string;
}

export interface UniverseStock {
  ticker: string;
  sector: string;
  epsGrowth: number;
  faScore: number;
}

export interface Tang1Stock extends UniverseStock {
  tang1Score: number;
}

export interface Tang2Stock extends Tang1Stock {
  tang1Member: boolean;
  globalSync: boolean;
  commoditySync: boolean;
  tang2Score: number;
}

export interface Tang3Stock extends Tang2Stock {
  sectorStrength: number;
  tang3Score: number;
}

export type Ma50Status = "safe" | "warning" | "broken";

export interface TaSignal {
  pattern: string;
  breakout: boolean;
  volSpike: number;
  foreignNet: number;
  leader: boolean;
  ma50Status: Ma50Status;
}

export interface Tang4Stock extends Tang3Stock {
  taData: TaSignal | null;
  tang4Score: number;
}

export interface ConfluenceStock {
  ticker: string;
  sector: string;
  inT1: boolean;
  inT2: boolean;
  inT3: boolean;
  inT4: boolean;
  matchCount: number;
  confluenceBonus: number;
  finalScore: number;
  taData: TaSignal | null;
}

export interface EliteDetail {
  entry: number;
  target: number;
  stoploss: number;
  weight: string;
  radar: {
    macro: number;
    flow: number;
    tech: number;
    sentiment: number;
  };
  reason: string;
}

export interface SelectedStockView {
  ticker: string;
  sector: string;
  score: number;
  matchCount: number;
  entry: string;
  target: string;
  stoploss: string;
  weight: string;
  radar: { macro: number; flow: number; tech: number; sentiment: number };
  reason: string;
  pattern: string;
  rr: string;
}

export interface GlobalIndexSector {
  index: string;
  country: string;
  sectors: string[];
  vnSectorsFavored: string[];
  rationale: string;
}

export type CommodityTrend = "Up" | "Down" | "Neutral";

export interface CommodityImpact {
  id: string;
  name: string;
  category: string;
  price: string;
  change: string;
  trend: CommodityTrend;
  sectorFavored: string;
  transmission: string;
}

export type SectorStatus = "Strong Positive" | "Positive" | "Neutral";

export interface SectorCatalyst {
  name: string;
  catalyst: string;
  status: SectorStatus;
  strength: number;
  flow: string;
}

export interface BlackSwanEvent {
  event: string;
  channel: string;
  impact: string;
}

export type RrgQuadrant = "Leading" | "Improving" | "Lagging" | "Weakening";

export interface RrgSector {
  name: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  rs: number;
  momentum: number;
  quadrant: RrgQuadrant;
  color: string;
}

export interface MacroNews {
  id: number;
  headline: string;
  impact: number;
  affectedSectors: string;
  relatedTicker: string;
  type: string;
}

export interface ActionableSignal {
  ticker: string;
  action: string;
  confidence: string;
  zone: string;
  status: string;
}

export interface RebalanceLogEntry {
  time: string;
  removed: string;
  added: string;
  reason: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  text: string;
}

export type TabId = "scanner" | "commodity" | "sectors" | "ta" | "elite";

export interface KellyCalculation {
  rrRatio: string;
  rawKelly: string;
  allocatedPercentage: string;
  allocatedCapital: number;
  shares: number;
  maxRiskCapital: number;
}

export interface ValuationRow {
  ticker: string;
  current: string;
  fairValue: string;
  mos: string;
  status: string;
}

export interface FunnelResult {
  tang1: Tang1Stock[];
  tang2: Tang2Stock[];
  tang3: Tang3Stock[];
  tang4: Tang4Stock[];
  confluence: ConfluenceStock[];
  eliteTop10: ConfluenceStock[];
  reserve11: ConfluenceStock | null;
}