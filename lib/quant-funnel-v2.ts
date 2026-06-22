import {
  UniverseStockV2, sectorCorrelationsV2, sectorStrengthV2, taSignalPoolV2,
  checkSectorConcentration,
} from "./quant-data-v2";

// ============================================================
// TANG 0 - ELIGIBILITY SCREEN (Muc 4.1)
// ============================================================
export interface EligibilityResult {
  ticker: string;
  isEligible: boolean;
  failedReasons: string[];
}

const MIN_AVG_DAILY_VALUE = 20000; // trieu VND
const MIN_LISTED_MONTHS = 6;
const MIN_MARKET_CAP_BN = 1000;
const MIN_QUARTERS_DATA = 8;

export function runTang0Eligibility(universe: UniverseStockV2[]): EligibilityResult[] {
  return universe.map((s) => {
    const reasons: string[] = [];
    if (s.eligibility.avgDailyValue20d < MIN_AVG_DAILY_VALUE) reasons.push("Thanh khoan duoi nguong toi thieu");
    if (s.eligibility.listedMonths < MIN_LISTED_MONTHS) reasons.push("Thoi gian niem yet chua du");
    if (s.eligibility.marketCapBn < MIN_MARKET_CAP_BN) reasons.push("Von hoa duoi nguong toi thieu");
    if (s.eligibility.isWarned) reasons.push("Dang bi canh bao/kiem soat");
    if (s.eligibility.quartersOfData < MIN_QUARTERS_DATA) reasons.push("Chua du du lieu BCTC (toi thieu 8 quy)");
    return { ticker: s.ticker, isEligible: reasons.length === 0, failedReasons: reasons };
  });
}

// ============================================================
// TANG 1 - FA SCORE 4 NHOM (Muc 5.1)
// ============================================================
export interface Tang1ResultV2 {
  ticker: string;
  sector: string;
  fa: UniverseStockV2["fa"];
  faScoreTotal: number;
  weights: { earningsQuality: number; sustainableGrowth: number; balanceSheetHealth: number; relativeValuation: number };
}

const DEFAULT_WEIGHTS = {
  earningsQuality: 0.3,
  sustainableGrowth: 0.3,
  balanceSheetHealth: 0.25,
  relativeValuation: 0.15,
};

const FINANCIAL_SECTOR_WEIGHTS = {
  earningsQuality: 0.35,
  sustainableGrowth: 0.2,
  balanceSheetHealth: 0.35,
  relativeValuation: 0.1,
};

export function computeTang1V2(universe: UniverseStockV2[], eligible: Set<string>): Tang1ResultV2[] {
  return universe
    .filter((s) => eligible.has(s.ticker))
    .map((s) => {
      const weights = s.capGroup === "financial" ? FINANCIAL_SECTOR_WEIGHTS : DEFAULT_WEIGHTS;
      const faScoreTotal =
        s.fa.earningsQuality * weights.earningsQuality +
        s.fa.sustainableGrowth * weights.sustainableGrowth +
        s.fa.balanceSheetHealth * weights.balanceSheetHealth +
        s.fa.relativeValuation * weights.relativeValuation;
      return {
        ticker: s.ticker,
        sector: s.sector,
        fa: s.fa,
        faScoreTotal: Math.round(faScoreTotal * 10) / 10,
        weights,
      };
    })
    .sort((a, b) => b.faScoreTotal - a.faScoreTotal);
}

// ============================================================
// TANG 2 - TUONG QUAN VI MO CO KIEM CHUNG (Muc 5.2)
// ============================================================
export interface Tang2ResultV2 {
  ticker: string;
  sector: string;
  tang1Score: number;
  correlation: number | null;
  channel: "capital_flow" | "input_cost" | null;
  referenceIndex: string | null;
  tang2Score: number;
}

export function computeTang2V2(tang1: Tang1ResultV2[]): Tang2ResultV2[] {
  const corrMap: Record<string, typeof sectorCorrelationsV2[number]> = {};
  sectorCorrelationsV2.forEach((c) => {
    corrMap[c.sector] = c;
  });

  return tang1
    .map((s) => {
      const corr = corrMap[s.sector] ?? null;
      const intensityBonus = corr ? Math.abs(corr.rollingCorrelation60d) * 12 : 0;
      return {
        ticker: s.ticker,
        sector: s.sector,
        tang1Score: s.faScoreTotal,
        correlation: corr ? corr.rollingCorrelation60d : null,
        channel: corr ? corr.channel : null,
        referenceIndex: corr ? corr.referenceIndex : null,
        tang2Score: Math.round((s.faScoreTotal + intensityBonus) * 10) / 10,
      };
    })
    .sort((a, b) => b.tang2Score - a.tang2Score);
}

// ============================================================
// TANG 3 - SUC MANH NGANH TINH THAT (Muc 5.3)
// ============================================================
export interface Tang3ResultV2 {
  ticker: string;
  sector: string;
  tang2Score: number;
  relativeStrength3m: number;
  breadthPctAboveMA50: number;
  policyNote: string;
  policyNoteSource: string;
  tang3Score: number;
}

export function computeTang3V2(tang2: Tang2ResultV2[]): Tang3ResultV2[] {
  const strengthMap: Record<string, typeof sectorStrengthV2[number]> = {};
  sectorStrengthV2.forEach((s) => {
    strengthMap[s.sector] = s;
  });

  return tang2
    .map((s) => {
      const strength = strengthMap[s.sector];
      const rsComponent = strength ? Math.max(-20, Math.min(20, strength.relativeStrength3m)) : 0;
      const breadthComponent = strength ? (strength.breadthPctAboveMA50 - 50) * 0.3 : 0;
      return {
        ticker: s.ticker,
        sector: s.sector,
        tang2Score: s.tang2Score,
        relativeStrength3m: strength?.relativeStrength3m ?? 0,
        breadthPctAboveMA50: strength?.breadthPctAboveMA50 ?? 50,
        policyNote: strength?.policyNote ?? "Chua co du lieu xuc tac chinh sach",
        policyNoteSource: strength?.policyNoteSource ?? "-",
        tang3Score: Math.round((s.tang2Score + rsComponent + breadthComponent) * 10) / 10,
      };
    })
    .sort((a, b) => b.tang3Score - a.tang3Score);
}

// ============================================================
// TANG 4 - TA + DONG TIEN NGOAI + ROOM NGOAI (Muc 5.4 + Nhom 5)
// ============================================================
export interface Tang4ResultV2 {
  ticker: string;
  sector: string;
  tang3Score: number;
  taData: ReturnType<typeof getTaData>;
  foreignRoomRemainingPct: number;
  insiderNetTransactionBn: number;
  tang4Score: number;
  riskFlags: string[];
}

function getTaData(ticker: string) {
  return taSignalPoolV2[ticker] ?? null;
}

export function computeTang4V2(
  tang3: Tang3ResultV2[],
  universe: UniverseStockV2[]
): Tang4ResultV2[] {
  const univMap: Record<string, UniverseStockV2> = {};
  universe.forEach((u) => {
    univMap[u.ticker] = u;
  });

  return tang3
    .map((s) => {
      const ta = getTaData(s.ticker);
      const univ = univMap[s.ticker];
      const riskFlags: string[] = [];

      const breakoutBonus = ta?.breakout ? 10 : 0;
      const volBonus = ta ? Math.min(ta.volSpikeRatio, 2.5) * 5 : 0;
      const foreignBonus = ta ? Math.max(Math.min(ta.foreignNetBn / 12, 12), -12) : 0;
      const leaderBonus = ta?.isSectorLeader ? 8 : 0;

      let ma50Penalty = 0;
      if (ta?.ma50Status === "broken") {
        ma50Penalty = -40;
        riskFlags.push("Vi pham MA50");
      } else if (ta?.ma50Status === "warning") {
        ma50Penalty = -10;
        riskFlags.push("Canh bao MA50");
      }
      if (ta?.ma200Status === "broken") {
        ma50Penalty -= 20;
        riskFlags.push("Vi pham MA200");
      }

      if (univ && univ.foreignRoomRemainingPct < 2) {
        riskFlags.push("Room ngoai con lai duoi 2% - kho mua them");
      }
      if (univ && univ.insiderNetTransactionBn < -10) {
        riskFlags.push("Noi bo ban rong dang ke gan day");
      }

      const tang4Score =
        s.tang3Score * 0.6 + breakoutBonus + volBonus + foreignBonus + leaderBonus + ma50Penalty;

      return {
        ticker: s.ticker,
        sector: s.sector,
        tang3Score: s.tang3Score,
        taData: ta,
        foreignRoomRemainingPct: univ?.foreignRoomRemainingPct ?? 0,
        insiderNetTransactionBn: univ?.insiderNetTransactionBn ?? 0,
        tang4Score: Math.round(tang4Score * 10) / 10,
        riskFlags,
      };
    })
    .sort((a, b) => b.tang4Score - a.tang4Score);
}

// ============================================================
// CONFLUENCE + KIEM SOAT TAP TRUNG NGANH (Muc 5.5)
// ============================================================
export interface ConfluenceResultV2 {
  ticker: string;
  sector: string;
  matchCount: number;
  confluenceBonus: number;
  finalScore: number;
  riskFlags: string[];
  taData: ReturnType<typeof getTaData>;
}

export function computeConfluenceV2(
  tang1: Tang1ResultV2[], tang2: Tang2ResultV2[], tang3: Tang3ResultV2[], tang4: Tang4ResultV2[]
): { ranked: ConfluenceResultV2[]; eliteTop10: ConfluenceResultV2[]; concentration: ReturnType<typeof checkSectorConcentration> } {
  const t1Set = new Set(tang1.map((s) => s.ticker));
  const t2Set = new Set(tang2.map((s) => s.ticker));
  const t3Set = new Set(tang3.map((s) => s.ticker));
  const t4Map: Record<string, Tang4ResultV2> = {};
  tang4.forEach((s) => {
    t4Map[s.ticker] = s;
  });

  const allTickers = new Set([...t1Set, ...t2Set, ...t3Set, ...Object.keys(t4Map)]);

  const ranked = Array.from(allTickers)
    .map((ticker) => {
      const t4 = t4Map[ticker];
      const matchCount = [t1Set.has(ticker), t2Set.has(ticker), t3Set.has(ticker), !!t4].filter(Boolean).length;
      const confluenceBonus = matchCount === 4 ? 20 : matchCount === 3 ? 10 : matchCount === 2 ? 3 : 0;
      const baseScore = t4 ? t4.tang4Score : 0;
      return {
        ticker,
        sector: t4?.sector ?? tang1.find((s) => s.ticker === ticker)?.sector ?? "-",
        matchCount,
        confluenceBonus,
        finalScore: Math.round((baseScore + confluenceBonus) * 10) / 10,
        riskFlags: t4?.riskFlags ?? [],
        taData: t4?.taData ?? null,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  const eliteTop10 = ranked.slice(0, 10);
  const concentration = checkSectorConcentration(eliteTop10, 3);

  return { ranked, eliteTop10, concentration };
}