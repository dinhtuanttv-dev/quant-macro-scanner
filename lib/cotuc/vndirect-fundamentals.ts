// Chỉ số cơ bản THẬT cho cả danh mục ~300 mã từ VNDirect finfo, theo LÔ (vài request cho cả danh mục) — thay
// /api/cotuc/fundamentals và /api/cotuc/earnings đang chết vì VCI trả 403 (10/2026: 0/17 mã có dữ liệu thật).
//
//   /v4/ratios (ratioCode): PRICE_TO_EARNINGS, PRICE_TO_BOOK, BVPS_CR, DIVIDEND_YIELD (tỷ lệ), BETA — giá trị mới nhất;
//                           EPS_TR (EPS 4 quý gần nhất, theo kỳ báo cáo).
//   /v4/financial_statements (QUARTER): 21001 doanh thu thuần, 23000 LNST cổ đông công ty mẹ, 13000 nợ phải trả,
//                           14000 vốn chủ sở hữu (đối chiếu FPT/HPG/VCB Q2/2026: tổng tài sản 12700 = 13000 + 14000).
// ROE (%) = LNST công ty mẹ 4 quý gần nhất / vốn chủ sở hữu quý gần nhất × 100 (cùng công thức route cũ).

import type { QuarterlyIncomeRow } from "./vci-financials-adapter";

const BASE = "https://api-finfo.vndirect.com.vn/v4";
const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const CHUNK = 50;

async function getJson(url: string, fetchImpl: typeof fetch): Promise<{ data?: unknown[] }> {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`VNDirect HTTP ${res.status}`);
  return res.json();
}

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const isoDaysAgo = (days: number, now = Date.now()) => new Date(now - days * 86_400_000).toISOString().slice(0, 10);

export interface RatioRow { code?: string; ratioCode?: string; reportDate?: string; value?: number | null }
export interface StatementRow { code?: string; itemCode?: number; fiscalDate?: string; numericValue?: number | null; reportType?: string }

export interface VndFundamentals {
  ticker: string;
  peRatio: number | null;
  pbRatio: number | null;
  epsTtm: number | null;
  bvps: number | null;
  dividendYield: number | null; // tỷ lệ (0.029 = 2,9%)
  beta: number | null;
  roe: number | null; // %
  debtEquity: number | null;
  netProfitTtm: number | null;
  equity: number | null;
  latestQuarter: string | null; // "Q2/2026"
  asOf: string | null; // ngày tỷ lệ mới nhất
}

/** Hàm thuần: giá trị MỚI NHẤT theo (mã, ratioCode). */
export function latestRatios(rows: RatioRow[]): Map<string, Map<string, { value: number; date: string }>> {
  const out = new Map<string, Map<string, { value: number; date: string }>>();
  for (const r of rows) {
    const code = r.code?.toUpperCase();
    if (!code || !r.ratioCode || !r.reportDate || typeof r.value !== "number" || !Number.isFinite(r.value)) continue;
    const m = out.get(code) ?? new Map();
    const cur = m.get(r.ratioCode);
    if (!cur || r.reportDate > cur.date) m.set(r.ratioCode, { value: r.value, date: r.reportDate });
    out.set(code, m);
  }
  return out;
}

interface QuarterAgg { fiscalDate: string; year: number; quarter: number; revenue: number | null; netProfit: number | null; liabilities: number | null; equity: number | null }

/** Hàm thuần: gộp dòng BCTC quý theo (mã, kỳ), mới -> cũ. */
export function groupStatements(rows: StatementRow[]): Map<string, QuarterAgg[]> {
  const by = new Map<string, Map<string, QuarterAgg>>();
  for (const r of rows) {
    const code = r.code?.toUpperCase();
    const fd = r.fiscalDate?.slice(0, 10);
    if (!code || !fd || !/^\d{4}-\d{2}-\d{2}$/.test(fd) || (r.reportType && r.reportType !== "QUARTER")) continue;
    const month = Number(fd.slice(5, 7));
    if (![3, 6, 9, 12].includes(month) || typeof r.numericValue !== "number") continue;
    const m = by.get(code) ?? new Map<string, QuarterAgg>();
    const q = m.get(fd) ?? { fiscalDate: fd, year: Number(fd.slice(0, 4)), quarter: month / 3, revenue: null, netProfit: null, liabilities: null, equity: null };
    const item = Number(r.itemCode);
    if (item === 21001) q.revenue = r.numericValue;
    else if (item === 23000) q.netProfit = r.numericValue;
    else if (item === 13000) q.liabilities = r.numericValue;
    else if (item === 14000) q.equity = r.numericValue;
    m.set(fd, q);
    by.set(code, m);
  }
  const out = new Map<string, QuarterAgg[]>();
  for (const [code, m] of by) out.set(code, [...m.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate)));
  return out;
}

/** Hàm thuần: ghép tỷ lệ + BCTC thành chỉ số cơ bản của một mã. */
export function buildVndFundamentals(ticker: string, ratios: Map<string, { value: number; date: string }> | undefined, quarters: QuarterAgg[] | undefined): VndFundamentals {
  const r = (k: string) => ratios?.get(k)?.value ?? null;
  const q = quarters ?? [];
  const last4 = q.slice(0, 4);
  const consecutive = last4.length === 4 && last4.every((x, i) => i === 0 || monthsBetween(x.fiscalDate, last4[i - 1].fiscalDate) === 3);
  const netProfitTtm = consecutive && last4.every((x) => x.netProfit !== null) ? last4.reduce((s, x) => s + (x.netProfit as number), 0) : null;
  const latestBal = q.find((x) => x.equity !== null && x.liabilities !== null) ?? null;
  const equity = latestBal?.equity ?? null;
  const roe = netProfitTtm !== null && equity && equity > 0 ? (netProfitTtm / equity) * 100 : null;
  const debtEquity = latestBal && equity && equity > 0 ? (latestBal.liabilities as number) / equity : null;
  const pe = r("PRICE_TO_EARNINGS");
  const dates = [...(ratios?.values() ?? [])].map((v) => v.date).sort();
  return {
    ticker,
    peRatio: pe !== null && pe > 0 && pe < 500 ? pe : null, // EPS âm / gần 0 -> P/E vô nghĩa
    pbRatio: r("PRICE_TO_BOOK"),
    epsTtm: r("EPS_TR"),
    bvps: r("BVPS_CR"),
    dividendYield: r("DIVIDEND_YIELD"),
    beta: r("BETA"),
    roe: roe !== null && Number.isFinite(roe) ? Math.round(roe * 10) / 10 : null,
    debtEquity: debtEquity !== null && Number.isFinite(debtEquity) ? Math.round(debtEquity * 100) / 100 : null,
    netProfitTtm,
    equity,
    latestQuarter: q[0] ? `Q${q[0].quarter}/${q[0].year}` : null,
    asOf: dates.at(-1) ?? null,
  };
}

function monthsBetween(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

/** Hàm thuần: BCTC quý -> định dạng QuarterlyIncomeRow (VCI) để dùng nguyên earnings-scoring.ts. */
export function toQuarterlyIncomeRows(ticker: string, quarters: QuarterAgg[]): QuarterlyIncomeRow[] {
  return quarters
    .filter((q) => q.revenue !== null || q.netProfit !== null)
    .map((q) => ({ ticker, year: q.year, quarter: q.quarter, revenue: q.revenue, netProfit: q.netProfit, eps: null, cogs: null, grossProfit: null, periodLabel: `Q${q.quarter}/${q.year}` }));
}

/** Tải tỷ lệ + BCTC cho cả danh sách (vài request). Lỗi một lô không làm hỏng lô khác. */
export async function fetchVndFundamentalsBulk(tickers: string[], { fetchImpl = fetch, now = Date.now() }: { fetchImpl?: typeof fetch; now?: number } = {}) {
  const ratioRows: RatioRow[] = [];
  const stmtRows: StatementRow[] = [];
  const errors: string[] = [];
  for (const part of chunks(tickers, CHUNK)) {
    const codes = part.map(encodeURIComponent).join(",");
    const jobs = [
      getJson(`${BASE}/ratios?q=code:${codes}~ratioCode:PRICE_TO_EARNINGS,PRICE_TO_BOOK,BVPS_CR,DIVIDEND_YIELD,BETA~reportDate:gte:${isoDaysAgo(10, now)}&size=10000`, fetchImpl)
        .then((j) => { ratioRows.push(...((j.data ?? []) as RatioRow[])); }),
      getJson(`${BASE}/ratios?q=code:${codes}~ratioCode:EPS_TR~reportDate:gte:${isoDaysAgo(220, now)}&size=10000`, fetchImpl)
        .then((j) => { ratioRows.push(...((j.data ?? []) as RatioRow[])); }),
      getJson(`${BASE}/financial_statements?q=code:${codes}~reportType:QUARTER~itemCode:21001,23000,13000,14000~fiscalDate:gte:${isoDaysAgo(800, now)}&size=10000`, fetchImpl)
        .then((j) => { stmtRows.push(...((j.data ?? []) as StatementRow[])); }),
    ];
    const settled = await Promise.allSettled(jobs);
    for (const s of settled) if (s.status === "rejected") errors.push(String((s.reason as Error)?.message ?? s.reason));
  }
  const ratios = latestRatios(ratioRows);
  const statements = groupStatements(stmtRows);
  return {
    fundamentals: tickers.map((t) => buildVndFundamentals(t, ratios.get(t), statements.get(t))),
    statements,
    errors,
  };
}
