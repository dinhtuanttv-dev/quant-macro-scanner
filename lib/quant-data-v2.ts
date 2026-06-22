// ============================================================
// QUANT DATA V2 - cau truc moi theo Dac ta nang cap
// Du lieu van la MAU (chua noi nguon thuc), nhung dung dung
// SHAPE/CAU TRUC ma dac ta yeu cau.
// ============================================================

export type CapGroup = "large" | "mid" | "small" | "financial";

export interface EligibilityFlags {
  avgDailyValue20d: number;
  listedMonths: number;
  marketCapBn: number;
  isWarned: boolean;
  quartersOfData: number;
}

export interface FaBreakdown {
  earningsQuality: number;
  sustainableGrowth: number;
  balanceSheetHealth: number;
  relativeValuation: number;
}

export interface UniverseStockV2 {
  ticker: string;
  sector: string;
  capGroup: CapGroup;
  eligibility: EligibilityFlags;
  fa: FaBreakdown;
  epsGrowth: number;
  foreignRoomRemainingPct: number;
  insiderNetTransactionBn: number;
  nextEarningsDate: string;
}

export const stockUniverseV2: UniverseStockV2[] = [
  {
    ticker: "FPT", sector: "Cong nghe", capGroup: "large",
    eligibility: { avgDailyValue20d: 185000, listedMonths: 220, marketCapBn: 185000, isWarned: false, quartersOfData: 60 },
    fa: { earningsQuality: 88, sustainableGrowth: 91, balanceSheetHealth: 85, relativeValuation: 62 },
    epsGrowth: 24.5, foreignRoomRemainingPct: 0.8, insiderNetTransactionBn: 12.4, nextEarningsDate: "2026-07-18",
  },
  {
    ticker: "PVS", sector: "Dau khi", capGroup: "mid",
    eligibility: { avgDailyValue20d: 62000, listedMonths: 180, marketCapBn: 28000, isWarned: false, quartersOfData: 60 },
    fa: { earningsQuality: 78, sustainableGrowth: 80, balanceSheetHealth: 74, relativeValuation: 71 },
    epsGrowth: 18.2, foreignRoomRemainingPct: 34.5, insiderNetTransactionBn: -3.1, nextEarningsDate: "2026-07-22",
  },
  {
    ticker: "TCB", sector: "Ngan hang", capGroup: "financial",
    eligibility: { avgDailyValue20d: 310000, listedMonths: 90, marketCapBn: 195000, isWarned: false, quartersOfData: 36 },
    fa: { earningsQuality: 82, sustainableGrowth: 76, balanceSheetHealth: 80, relativeValuation: 75 },
    epsGrowth: 15.8, foreignRoomRemainingPct: 6.2, insiderNetTransactionBn: 0, nextEarningsDate: "2026-07-20",
  },
  {
    ticker: "HAH", sector: "Van tai bien", capGroup: "mid",
    eligibility: { avgDailyValue20d: 45000, listedMonths: 130, marketCapBn: 9500, isWarned: false, quartersOfData: 48 },
    fa: { earningsQuality: 80, sustainableGrowth: 94, balanceSheetHealth: 68, relativeValuation: 58 },
    epsGrowth: 32.1, foreignRoomRemainingPct: 41.0, insiderNetTransactionBn: 5.6, nextEarningsDate: "2026-07-25",
  },
  {
    ticker: "DGC", sector: "Hoa chat", capGroup: "mid",
    eligibility: { avgDailyValue20d: 78000, listedMonths: 160, marketCapBn: 32000, isWarned: false, quartersOfData: 56 },
    fa: { earningsQuality: 85, sustainableGrowth: 83, balanceSheetHealth: 90, relativeValuation: 55 },
    epsGrowth: 21.4, foreignRoomRemainingPct: 18.7, insiderNetTransactionBn: -8.2, nextEarningsDate: "2026-07-19",
  },
  {
    ticker: "GVR", sector: "Cao su", capGroup: "large",
    eligibility: { avgDailyValue20d: 38000, listedMonths: 95, marketCapBn: 145000, isWarned: false, quartersOfData: 32 },
    fa: { earningsQuality: 74, sustainableGrowth: 77, balanceSheetHealth: 88, relativeValuation: 80 },
    epsGrowth: 19.6, foreignRoomRemainingPct: 47.0, insiderNetTransactionBn: 0, nextEarningsDate: "2026-07-23",
  },
  {
    ticker: "MWG", sector: "Ban le", capGroup: "large",
    eligibility: { avgDailyValue20d: 95000, listedMonths: 150, marketCapBn: 62000, isWarned: false, quartersOfData: 52 },
    fa: { earningsQuality: 70, sustainableGrowth: 86, balanceSheetHealth: 72, relativeValuation: 48 },
    epsGrowth: 28.3, foreignRoomRemainingPct: 2.1, insiderNetTransactionBn: -15.8, nextEarningsDate: "2026-07-17",
  },
  {
    ticker: "HPG", sector: "Thep", capGroup: "large",
    eligibility: { avgDailyValue20d: 220000, listedMonths: 200, marketCapBn: 175000, isWarned: false, quartersOfData: 60 },
    fa: { earningsQuality: 76, sustainableGrowth: 68, balanceSheetHealth: 65, relativeValuation: 70 },
    epsGrowth: 16.8, foreignRoomRemainingPct: 11.4, insiderNetTransactionBn: 0, nextEarningsDate: "2026-07-21",
  },
  {
    ticker: "VCB", sector: "Ngan hang", capGroup: "financial",
    eligibility: { avgDailyValue20d: 280000, listedMonths: 210, marketCapBn: 420000, isWarned: false, quartersOfData: 60 },
    fa: { earningsQuality: 90, sustainableGrowth: 70, balanceSheetHealth: 92, relativeValuation: 60 },
    epsGrowth: 13.1, foreignRoomRemainingPct: 0.4, insiderNetTransactionBn: 0, nextEarningsDate: "2026-07-20",
  },
  {
    ticker: "NLG", sector: "Bat dong san", capGroup: "mid",
    eligibility: { avgDailyValue20d: 52000, listedMonths: 140, marketCapBn: 14000, isWarned: false, quartersOfData: 48 },
    fa: { earningsQuality: 65, sustainableGrowth: 60, balanceSheetHealth: 78, relativeValuation: 82 },
    epsGrowth: 12.5, foreignRoomRemainingPct: 29.0, insiderNetTransactionBn: 2.3, nextEarningsDate: "2026-07-24",
  },
];

export interface SectorCorrelation {
  sector: string;
  referenceIndex: string;
  rollingCorrelation60d: number;
  channel: "capital_flow" | "input_cost";
  lastUpdated: string;
}

export const sectorCorrelationsV2: SectorCorrelation[] = [
  { sector: "Cong nghe", referenceIndex: "Nasdaq", rollingCorrelation60d: 0.62, channel: "capital_flow", lastUpdated: "2026-06-01" },
  { sector: "Dau khi", referenceIndex: "Dau Brent", rollingCorrelation60d: 0.71, channel: "input_cost", lastUpdated: "2026-06-01" },
  { sector: "Ngan hang", referenceIndex: "DXY", rollingCorrelation60d: -0.45, channel: "capital_flow", lastUpdated: "2026-06-01" },
  { sector: "Van tai bien", referenceIndex: "Cuoc Container Drewry", rollingCorrelation60d: 0.58, channel: "input_cost", lastUpdated: "2026-06-01" },
  { sector: "Hoa chat", referenceIndex: "Phot pho vang", rollingCorrelation60d: 0.49, channel: "input_cost", lastUpdated: "2026-06-01" },
  { sector: "Thep", referenceIndex: "HRC the gioi", rollingCorrelation60d: 0.55, channel: "input_cost", lastUpdated: "2026-06-01" },
  { sector: "Cao su", referenceIndex: "Cao su TOCOM", rollingCorrelation60d: 0.66, channel: "input_cost", lastUpdated: "2026-06-01" },
  { sector: "Ban le", referenceIndex: "S&P 500", rollingCorrelation60d: 0.31, channel: "capital_flow", lastUpdated: "2026-06-01" },
  { sector: "Bat dong san", referenceIndex: "US 10Y Yield", rollingCorrelation60d: -0.38, channel: "capital_flow", lastUpdated: "2026-06-01" },
];

export interface SectorStrengthV2 {
  sector: string;
  relativeStrength1m: number;
  relativeStrength3m: number;
  relativeStrength6m: number;
  breadthPctAboveMA50: number;
  breadthPctVolUp: number;
  policyNote: string;
  policyNoteSource: string;
  policyNoteDate: string;
}

export const sectorStrengthV2: SectorStrengthV2[] = [
  { sector: "Cong nghe", relativeStrength1m: 8.2, relativeStrength3m: 15.4, relativeStrength6m: 28.1, breadthPctAboveMA50: 78, breadthPctVolUp: 65, policyNote: "Chuyen doi so quoc gia, ho tro thue cho R&D phan mem", policyNoteSource: "Bo TT&TT", policyNoteDate: "2026-05-12" },
  { sector: "Dau khi", relativeStrength1m: 5.1, relativeStrength3m: 11.2, relativeStrength6m: 19.6, breadthPctAboveMA50: 70, breadthPctVolUp: 58, policyNote: "Du an Lo B O Mon tiep tuc giai ngan dung tien do", policyNoteSource: "PVN", policyNoteDate: "2026-05-20" },
  { sector: "Ngan hang", relativeStrength1m: 1.4, relativeStrength3m: 4.2, relativeStrength6m: 9.8, breadthPctAboveMA50: 55, breadthPctVolUp: 48, policyNote: "Thong tu 02 gia han trich lap du phong no xau", policyNoteSource: "NHNN", policyNoteDate: "2026-04-30" },
  { sector: "Van tai bien", relativeStrength1m: 9.8, relativeStrength3m: 22.1, relativeStrength6m: 31.5, breadthPctAboveMA50: 82, breadthPctVolUp: 71, policyNote: "Cuoc tau toan cau neo cao do bat on tuyen Bien Do", policyNoteSource: "Drewry", policyNoteDate: "2026-06-05" },
  { sector: "Hoa chat", relativeStrength1m: 6.5, relativeStrength3m: 13.8, relativeStrength6m: 24.0, breadthPctAboveMA50: 74, breadthPctVolUp: 60, policyNote: "Nhu cau Phot pho vang tu chuoi ban dan Dong A", policyNoteSource: "Bao cao nganh hoa chat", policyNoteDate: "2026-05-28" },
  { sector: "Thep", relativeStrength1m: 2.0, relativeStrength3m: 6.4, relativeStrength6m: 12.1, breadthPctAboveMA50: 52, breadthPctVolUp: 45, policyNote: "Ap thue chong ban pha gia thep nhap khau", policyNoteSource: "Bo Cong Thuong", policyNoteDate: "2026-04-15" },
  { sector: "Cao su", relativeStrength1m: 7.1, relativeStrength3m: 16.9, relativeStrength6m: 26.4, breadthPctAboveMA50: 76, breadthPctVolUp: 63, policyNote: "Thieu cung cao su tu nhien tai Thai Lan", policyNoteSource: "Reuters", policyNoteDate: "2026-06-02" },
  { sector: "Ban le", relativeStrength1m: 3.2, relativeStrength3m: 7.8, relativeStrength6m: 14.2, breadthPctAboveMA50: 60, breadthPctVolUp: 50, policyNote: "Giam thue VAT 2% ho tro suc mua noi dia", policyNoteSource: "Chinh phu", policyNoteDate: "2026-05-01" },
  { sector: "Bat dong san", relativeStrength1m: -1.5, relativeStrength3m: 1.2, relativeStrength6m: 4.5, breadthPctAboveMA50: 38, breadthPctVolUp: 35, policyNote: "Luat Dat Dai sua doi ky vong co hieu luc som", policyNoteSource: "Quoc hoi", policyNoteDate: "2026-03-20" },
];

export interface TaSignalV2 {
  pattern: string;
  breakout: boolean;
  volSpikeRatio: number;
  foreignNetBn: number;
  isSectorLeader: boolean;
  ma50Status: "safe" | "warning" | "broken";
  ma200Status: "safe" | "warning" | "broken";
}

export const taSignalPoolV2: Record<string, TaSignalV2> = {
  FPT: { pattern: "Nen phang doc len (CANSLIM)", breakout: true, volSpikeRatio: 2.4, foreignNetBn: 480.5, isSectorLeader: true, ma50Status: "safe", ma200Status: "safe" },
  PVS: { pattern: "Tich luy SOS", breakout: true, volSpikeRatio: 1.9, foreignNetBn: -12.3, isSectorLeader: false, ma50Status: "safe", ma200Status: "safe" },
  TCB: { pattern: "Cup & Handle", breakout: false, volSpikeRatio: 1.3, foreignNetBn: 185.7, isSectorLeader: true, ma50Status: "safe", ma200Status: "safe" },
  HAH: { pattern: "VCP thu hep", breakout: true, volSpikeRatio: 2.1, foreignNetBn: 45.2, isSectorLeader: false, ma50Status: "safe", ma200Status: "safe" },
  DGC: { pattern: "Nen gia phang 6 thang", breakout: false, volSpikeRatio: 1.6, foreignNetBn: 112.4, isSectorLeader: false, ma50Status: "safe", ma200Status: "safe" },
  GVR: { pattern: "Hoi phuc Spring", breakout: true, volSpikeRatio: 1.8, foreignNetBn: 28.6, isSectorLeader: false, ma50Status: "warning", ma200Status: "safe" },
  MWG: { pattern: "Song tang chu dao", breakout: true, volSpikeRatio: 2.0, foreignNetBn: 320.1, isSectorLeader: true, ma50Status: "safe", ma200Status: "safe" },
  HPG: { pattern: "Tich luy kenh tren", breakout: false, volSpikeRatio: 1.2, foreignNetBn: -22.1, isSectorLeader: false, ma50Status: "broken", ma200Status: "warning" },
  VCB: { pattern: "Tich luy chat hep", breakout: false, volSpikeRatio: 0.9, foreignNetBn: 65.3, isSectorLeader: true, ma50Status: "safe", ma200Status: "safe" },
  NLG: { pattern: "2 day but pha", breakout: true, volSpikeRatio: 1.5, foreignNetBn: 15.8, isSectorLeader: false, ma50Status: "warning", ma200Status: "safe" },
};

export type MarketRegime = "risk_on" | "bullish_diverging" | "sideways" | "cautious" | "risk_off";

export interface MarketStructureData {
  vnIndexVsMA50Pct: number;
  vnIndexVsMA100Pct: number;
  vnIndexVsMA200Pct: number;
  breadthPctAboveMA50: number;
  breadthPctAboveMA200: number;
  consecutiveUpDays: number;
  volumeVs20dAvgPct: number;
  totalMarketValueBn: number;
  liquidityTrendPct: number;
  largeCapFlowPct: number;
  midCapFlowPct: number;
  smallCapFlowPct: number;
  foreignNetMarketBn: number;
  proprietaryNetMarketBn: number;
  marginBalanceTrend: "rising" | "falling" | "stable";
  historicalVolatility20d: number;
  newHighs52w: number;
  newLows52w: number;
  sectorDispersionScore: number;
  macroTailwinds: string[];
  macroHeadwinds: string[];
  vn30FuturesBasisPct: number;
  openInterestChangePct: number;
  regime: MarketRegime;
  regimeLabel: string;
  regimeImplication: string;
  lastUpdated: string;
}

export const marketStructureDataV2: MarketStructureData = {
  vnIndexVsMA50Pct: 3.2,
  vnIndexVsMA100Pct: 5.8,
  vnIndexVsMA200Pct: 9.1,
  breadthPctAboveMA50: 58,
  breadthPctAboveMA200: 62,
  consecutiveUpDays: 3,
  volumeVs20dAvgPct: 112,
  totalMarketValueBn: 24500,
  liquidityTrendPct: 8.5,
  largeCapFlowPct: 45,
  midCapFlowPct: 35,
  smallCapFlowPct: 20,
  foreignNetMarketBn: 320,
  proprietaryNetMarketBn: -45,
  marginBalanceTrend: "rising",
  historicalVolatility20d: 14.2,
  newHighs52w: 38,
  newLows52w: 12,
  sectorDispersionScore: 42,
  macroTailwinds: ["FED ky vong giam lai suat cuoi nam", "Dong von ETF dao moi vao thi truong"],
  macroHeadwinds: ["DXY van neo cao gay ap luc ty gia", "Cang thang Bien Do anh huong chuoi cung ung"],
  vn30FuturesBasisPct: 0.6,
  openInterestChangePct: 4.2,
  regime: "bullish_diverging",
  regimeLabel: "Tang truong nhung phan hoa",
  regimeImplication: "Uu tien than trong hon voi nhom von hoa nho, theo doi do rong thi truong truoc khi giai ngan toan bo.",
  lastUpdated: "2026-06-21T08:00:00+07:00",
};

export const marketRegimeLabels: Record<MarketRegime, { label: string; implication: string; color: string }> = {
  risk_on: { label: "Tang truong manh (Risk-On)", implication: "Ap dung day du khuyen nghi tu ket qua 4 tang loc.", color: "#34d399" },
  bullish_diverging: { label: "Tang truong nhung phan hoa", implication: "Uu tien than trong hon voi nhom von hoa nho.", color: "#a3e635" },
  sideways: { label: "Di ngang tich luy", implication: "Giam muc do tich cuc, theo doi them tin hieu xac nhan.", color: "#fbbf24" },
  cautious: { label: "Suy yeu can than trong", implication: "Canh bao chu dong du Elite 10 van liet ke ma dep.", color: "#fb923c" },
  risk_off: { label: "Giam manh can phong thu", implication: "Khuyen nghi giam ty trong tong the, khong chi chon ma.", color: "#f87171" },
};

export type WatchlistStatus = "qualified" | "partial" | "rejected_t1" | "insufficient_data";

export interface WatchlistEntry {
  ticker: string;
  addedDate: string;
  status: WatchlistStatus;
  stoppedAtTang: 0 | 1 | 2 | 3 | 4 | null;
  reason: string;
  finalScore: number | null;
}

export const watchlistSampleV2: WatchlistEntry[] = [
  { ticker: "VHM", addedDate: "2026-06-15", status: "partial", stoppedAtTang: 3, reason: "Dat Tang 1-2 nhung suc manh nganh BDS dang yeu (RS 6 thang am)", finalScore: null },
  { ticker: "HNG", addedDate: "2026-06-18", status: "rejected_t1", stoppedAtTang: 1, reason: "EPS growth am (-12.4%), chat luong loi nhuan duoi nguong toi thieu", finalScore: null },
  { ticker: "FOX", addedDate: "2026-06-19", status: "insufficient_data", stoppedAtTang: null, reason: "Chua du 8 quy BCTC lien tiep de tinh xu huong Tang 1", finalScore: null },
  { ticker: "DBC", addedDate: "2026-06-10", status: "qualified", stoppedAtTang: null, reason: "Dat ca 4 tang, du dieu kien canh tranh Elite 10", finalScore: 78.4 },
];

export function checkSectorConcentration(
  eliteList: { sector: string }[],
  maxPerSector: number = 3
): { sector: string; count: number; isOverConcentrated: boolean }[] {
  const counts: Record<string, number> = {};
  eliteList.forEach((s) => {
    counts[s.sector] = (counts[s.sector] || 0) + 1;
  });
  return Object.entries(counts).map(([sector, count]) => ({
    sector,
    count,
    isOverConcentrated: count > maxPerSector,
  }));
}