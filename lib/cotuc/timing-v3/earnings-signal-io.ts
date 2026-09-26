/**
 * earnings-signal-io.ts - Lop I/O THAT cho Earnings Engine (Giai doan
 * 3): noi buildEarningsSignal() (logic thuan tu goi) voi:
 *  - So lieu loi nhuan theo quy THAT (VCI financials adapter, da co san).
 *  - Ngay cong bo BCTC THAT tung quy (CafeF disclosure scraper, MOI viet
 *    o Giai doan 3 - xem cafef-earnings-disclosure-scraper.ts de biet
 *    ly do can nguon nay).
 *
 * Han phap ly (legalDeadline): tai su dung DUNG quy tac da co san trong
 * lib/cotuc/earnings-scoring.ts (estimateNextDisclosureDeadline) - BCTC
 * hop nhat = quarterEnd + 45 ngay - KHONG tu bia quy tac moi.
 */
import { fetchQuarterlyIncome } from "@/lib/cotuc/vci-financials-adapter";
import { fetchEarningsDisclosureHistory, type EarningsDisclosureRecord } from "@/lib/cotuc/cafef-earnings-disclosure-scraper";
import { buildEarningsSignal, type QuarterlyRecord } from "./earnings-signal";
import type { EarningsSignal } from "./timing-types";

function getQuarterEndDate(year: number, quarter: number): Date {
  const endMonth = quarter * 3;
  return new Date(Date.UTC(year, endMonth, 0));
}

/** Han phap ly BCTC HOP NHAT = ket thuc quy + 45 ngay (dung quy tac da
 * co san trong earnings-scoring.ts, khong bia moi). */
function legalDeadlineFor(year: number, quarter: number): string {
  const quarterEnd = getQuarterEndDate(year, quarter);
  const deadline = new Date(quarterEnd);
  deadline.setUTCDate(deadline.getUTCDate() + 45);
  return deadline.toISOString().slice(0, 10);
}

export interface EarningsSignalFailure {
  reason: "FINANCIALS_FETCH_FAILED" | "DISCLOSURE_FETCH_FAILED" | "NO_TARGET_QUARTER";
  detail: string;
}

/** Chon dung 1 ban ghi HOP NHAT cho moi (year,quarter) - neu CafeF co
 * ca 2 (cong ty me + hop nhat), UU TIEN hop nhat (khop voi netProfit
 * cua VCI, cung la so lieu hop nhat). */
function pickConsolidated(records: EarningsDisclosureRecord[]): Map<string, EarningsDisclosureRecord> {
  const map = new Map<string, EarningsDisclosureRecord>();
  for (const r of records) {
    const key = `${r.year}-Q${r.quarter}`;
    const existing = map.get(key);
    if (!existing || (existing.isParentOnly && !r.isParentOnly)) map.set(key, r);
  }
  return map;
}

export async function buildEarningsSignalForTicker(
  ticker: string,
  isBank: boolean,
): Promise<EarningsSignal | EarningsSignalFailure> {
  const [finRes, discRes] = await Promise.all([
    fetchQuarterlyIncome(ticker),
    fetchEarningsDisclosureHistory(ticker),
  ]);

  if (!finRes.available || finRes.quarters.length === 0) {
    return { reason: "FINANCIALS_FETCH_FAILED", detail: finRes.error ?? "Khong co du lieu tai chinh tu VCI" };
  }

  // finRes.quarters: moi MOI NHAT den CU NHAT - dao lai thanh TANG DAN
  // (yeu cau cua buildEarningsSignal, xem comment goc trong core engine).
  const ascending = [...finRes.quarters].sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
  const target = ascending[ascending.length - 1];
  if (!target) return { reason: "NO_TARGET_QUARTER", detail: "Khong xac dinh duoc quy gan nhat" };

  const disclosureMap = discRes.success ? pickConsolidated(discRes.records) : new Map<string, EarningsDisclosureRecord>();
  // KHONG chan cung (fail-open): neu CafeF loi/khong co, van tinh SUE
  // binh thuong (chi khong co lich su announceDate that -> engine tu
  // dong xuong cap "DEADLINE_ONLY", KHONG bia).

  const history: QuarterlyRecord[] = ascending.slice(0, -1).map((q) => {
    const key = `${q.year}-Q${q.quarter}`;
    const disc = disclosureMap.get(key);
    return {
      quarterLabel: `Q${q.quarter}/${q.year}`,
      legalDeadline: legalDeadlineFor(q.year, q.quarter),
      announceDate: disc?.announceDate ?? null,
      earningsMetric: q.netProfit,
      extraordinaryShare: null, // MISSING minh bach - VCI khong cung cap truc tiep, khong bia
    };
  });

  const targetKey = `${target.year}-Q${target.quarter}`;
  const targetDisc = disclosureMap.get(targetKey);
  const targetRecord: QuarterlyRecord = {
    quarterLabel: `Q${target.quarter}/${target.year}`,
    legalDeadline: legalDeadlineFor(target.year, target.quarter),
    announceDate: targetDisc?.announceDate ?? null,
    earningsMetric: target.netProfit,
    extraordinaryShare: null,
  };

  // Tang truong YoY: so voi cung ky nam truoc (index lui 4 quy).
  const idx = ascending.length - 1;
  const yoyBase = ascending[idx - 4];
  const revenueGrowthYoY = yoyBase?.revenue && target.revenue !== null && yoyBase.revenue !== 0
    ? target.revenue / yoyBase.revenue - 1 : null;
  const profitGrowthYoY = yoyBase?.netProfit && target.netProfit !== null && yoyBase.netProfit !== 0
    ? target.netProfit / yoyBase.netProfit - 1 : null;

  return buildEarningsSignal({
    ticker, isBank, history, target: targetRecord,
    revenueGrowthYoY, profitGrowthYoY,
    profitTtmGrowthYoY: null, // can 4 quy lien tiep cong don, ngoai pham vi don gian hoa Giai doan 3
    version: "v3-p3", asOf: new Date().toISOString().slice(0, 10),
  });
}
