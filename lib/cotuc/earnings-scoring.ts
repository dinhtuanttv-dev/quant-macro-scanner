// Earnings Scoring - tinh tang truong QoQ/YoY tu du lieu KQKD that,
// xep hang ma tot nhat, va uoc tinh HAN CONG BO BCTC theo quy dinh
// phap luat (KHONG PHAI ngay cong ty tu thong bao - VN khong co lich
// earnings chinh thuc nhu My).

import type { QuarterlyIncomeRow } from "./vci-financials-adapter";

export interface EarningsGrowthResult {
  ticker: string;
  latestQuarter: QuarterlyIncomeRow;
  revenueGrowthQoQ: number | null;  // % so voi quy truoc
  revenueGrowthYoY: number | null;  // % so voi cung ky nam truoc
  profitGrowthQoQ: number | null;
  profitGrowthYoY: number | null;
  earningsScore: number;             // 0-100, tong hop QoQ+YoY
  dataQuality: "HARD_DATA";
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

/** Tim quy cung ky nam truoc (vd Q3/2026 -> Q3/2025) trong danh sach da sap xep giam dan. */
function findSameQuarterLastYear(quarters: QuarterlyIncomeRow[], target: QuarterlyIncomeRow): QuarterlyIncomeRow | null {
  return quarters.find((q) => q.year === target.year - 1 && q.quarter === target.quarter) ?? null;
}

export function calculateEarningsGrowth(ticker: string, quarters: QuarterlyIncomeRow[]): EarningsGrowthResult | null {
  if (quarters.length === 0) return null;

  const latest = quarters[0];       // Da sap xep giam dan (moi nhat truoc)
  const previous = quarters[1] ?? null; // Quy lien truoc (QoQ)
  const sameQuarterLastYear = findSameQuarterLastYear(quarters, latest); // YoY

  const revenueGrowthQoQ = previous ? pctChange(latest.revenue, previous.revenue) : null;
  const revenueGrowthYoY = sameQuarterLastYear ? pctChange(latest.revenue, sameQuarterLastYear.revenue) : null;
  const profitGrowthQoQ = previous ? pctChange(latest.netProfit, previous.netProfit) : null;
  const profitGrowthYoY = sameQuarterLastYear ? pctChange(latest.netProfit, sameQuarterLastYear.netProfit) : null;

  // Diem tong hop: uu tien YoY (phan anh tang truong that, khong bi anh huong
  // boi tinh mua vu) hon QoQ. Trong so: YoY 60%, QoQ 40%. Neu thieu du lieu,
  // chi tinh tren phan co san (khong ep ve 0).
  const components: number[] = [];
  const weights: number[] = [];

  if (revenueGrowthYoY !== null) { components.push(scoreGrowth(revenueGrowthYoY)); weights.push(0.3); }
  if (profitGrowthYoY !== null) { components.push(scoreGrowth(profitGrowthYoY)); weights.push(0.3); }
  if (revenueGrowthQoQ !== null) { components.push(scoreGrowth(revenueGrowthQoQ)); weights.push(0.2); }
  if (profitGrowthQoQ !== null) { components.push(scoreGrowth(profitGrowthQoQ)); weights.push(0.2); }

  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const earningsScore = totalWeight > 0
    ? Math.round(components.reduce((s, c, i) => s + c * weights[i], 0) / totalWeight)
    : 0;

  return {
    ticker, latestQuarter: latest,
    revenueGrowthQoQ, revenueGrowthYoY, profitGrowthQoQ, profitGrowthYoY,
    earningsScore, dataQuality: "HARD_DATA",
  };
}

/** Anh xa % tang truong ve thang diem 0-100. Tang truong -30% den +50% -> 0-100. */
function scoreGrowth(growthPct: number): number {
  const clamped = Math.max(-30, Math.min(50, growthPct));
  return Math.round(((clamped + 30) / 80) * 100);
}

export function rankBestEarnings(results: EarningsGrowthResult[], topN = 20): EarningsGrowthResult[] {
  return [...results].sort((a, b) => b.earningsScore - a.earningsScore).slice(0, topN);
}

// ============================================================
// HAN CONG BO BCTC - tinh theo QUY DINH PHAP LUAT, KHONG PHAI
// ngay cong ty tu cong bo (VN khong co lich earnings chinh thuc).
// Can doi chieu lai voi Thong tu hien hanh khi ap dung thuc te.
// ============================================================

export interface DisclosureDeadline {
  quarterLabel: string;       // "Q3/2026"
  quarterEndDate: string;     // Ngay ket thuc quy (ISO)
  deadlineStandalone: string; // Han BCTC rieng le (uoc tinh +20 ngay)
  deadlineConsolidated: string; // Han BCTC hop nhat (uoc tinh +45 ngay)
  daysUntilStandalone: number;
  daysUntilConsolidated: number;
  isEstimate: true;
}

function getQuarterEndDate(year: number, quarter: number): Date {
  const endMonth = quarter * 3; // Q1->3, Q2->6, Q3->9, Q4->12
  return new Date(year, endMonth, 0); // Ngay cuoi cung cua thang endMonth
}

function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Uoc tinh han cong bo BCTC cho QUY HIEN TAI (quy dang chay, chua ket thuc hoac vua ket thuc). */
export function estimateNextDisclosureDeadline(referenceDate: Date = new Date()): DisclosureDeadline {
  const currentQuarter = Math.floor(referenceDate.getMonth() / 3) + 1;
  const currentYear = referenceDate.getFullYear();
  const quarterEnd = getQuarterEndDate(currentYear, currentQuarter);

  const deadlineStandalone = addDaysUTC(quarterEnd, 20);
  const deadlineConsolidated = addDaysUTC(quarterEnd, 45);

  const now = new Date(); now.setUTCHours(0, 0, 0, 0);
  const daysUntilStandalone = Math.ceil((deadlineStandalone.getTime() - now.getTime()) / 86400000);
  const daysUntilConsolidated = Math.ceil((deadlineConsolidated.getTime() - now.getTime()) / 86400000);

  return {
    quarterLabel: `Q${currentQuarter}/${currentYear}`,
    quarterEndDate: quarterEnd.toISOString().slice(0, 10),
    deadlineStandalone: deadlineStandalone.toISOString().slice(0, 10),
    deadlineConsolidated: deadlineConsolidated.toISOString().slice(0, 10),
    daysUntilStandalone, daysUntilConsolidated,
    isEstimate: true,
  };
}
