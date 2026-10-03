// VNDirect finfo (api-finfo.vndirect.com.vn) — nguồn SỰ KIỆN QUYỀN và BCTC QUÝ cho Timing Engine cổ tức.
//
// Vì sao (kiểm tra 03/10/2026): VCI (iq.vietcap.com.vn) trả HTTP 403 cả trên production -> /api/cotuc/earnings-signal và
// lịch sử cổ tức theo sự kiện VCI đang hỏng; trang CafeF "event.chn" đổi cấu trúc nên bộ thu thập ngày công bố BCTC không
// còn đọc được. VNDirect finfo trả ổn định (Market Gateway cũng đang dùng cho tin tức).
//
//   /v4/events (group investorRight): DIVIDEND (tiền mặt, `dividend` = đ/CP), STOCKDIV (cổ tức CP), KINDDIV (CP thưởng),
//     `ratio` = % (15 = 100:15), `effectiveDate` = ngày GDKHQ. Đã đối chiếu: VNM 26/06/2026 1.850đ; FPT 21/09/2026 thưởng 10%;
//     REE 18/05/2026 cổ tức CP 15% (khớp các điểm lệch tìm thấy trên dữ liệu giá SSI).
//   /v4/financial_statements (reportType QUARTER): itemCode 21001 = doanh thu thuần, 23000 = LNST cổ đông công ty mẹ
//     (đối chiếu: VNM 2024 = 9.392 tỷ, VCB 2024 = 33.831 tỷ — khớp số công bố); `createdDate` = ngày VNDirect nhập BCTC,
//     dùng làm NGÀY CÔNG BỐ (sai lệch thường ≤ 1 ngày so với công bố chính thức).
//
// Định dạng trả về giống fetchQuarterlyIncome (VCI) và fetchEarningsDisclosureHistory (CafeF) để thay thế không đổi logic.

const BASE = "https://api-finfo.vndirect.com.vn/v4";
const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
const ITEM_REVENUE = 21001;
const ITEM_NPAT_PARENT = 23000;

async function getJson(url: string, fetchImpl: typeof fetch, timeoutMs = 15_000): Promise<{ data?: unknown[] }> {
  const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`VNDirect HTTP ${res.status}`);
  return res.json();
}

export interface VndCorporateActions {
  ok: boolean;
  cash: { exDate: string; valuePerShare: number; note: string | null }[];
  shares: { exDate: string; ratio: number; kind: "STOCKDIV" | "KINDDIV"; note: string | null }[];
  meetings: string[];
  error?: string;
}

interface RawEvent { type?: string; effectiveDate?: string; dividend?: number | null; ratio?: number | null; note?: string | null; locale?: string }

/** Chuẩn hoá danh sách sự kiện thô (hàm thuần, để test). */
export function parseVndEvents(rows: RawEvent[]): Omit<VndCorporateActions, "ok" | "error"> {
  const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
  const cash = new Map<string, { exDate: string; valuePerShare: number; note: string | null }>();
  const shares = new Map<string, { exDate: string; ratio: number; kind: "STOCKDIV" | "KINDDIV"; note: string | null }>();
  const meetings = new Set<string>();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue; // mỗi sự kiện có 2 bản VN/EN_GB
    const d = day(e.effectiveDate);
    if (!d) continue;
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      const k = `${d}`;
      const prev = cash.get(k);
      cash.set(k, { exDate: d, valuePerShare: (prev?.valuePerShare ?? 0) + e.dividend, note: e.note ?? null }); // 2 đợt cùng ngày GDKHQ -> cộng
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const k = `${d}:${e.type}`;
      shares.set(k, { exDate: d, ratio: e.ratio / 100, kind: e.type, note: e.note ?? null });
    } else if (e.type === "MEETING") {
      meetings.add(d);
    }
  }
  const byDate = <T extends { exDate: string }>(a: T, b: T) => a.exDate.localeCompare(b.exDate);
  return { cash: [...cash.values()].sort(byDate), shares: [...shares.values()].sort(byDate), meetings: [...meetings].sort() };
}

export async function fetchVndCorporateActions(ticker: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<VndCorporateActions> {
  try {
    const url = `${BASE}/events?q=code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING&sort=effectiveDate:desc&size=500`;
    const json = await getJson(url, fetchImpl);
    return { ok: true, ...parseVndEvents((json.data ?? []) as RawEvent[]) };
  } catch (e) {
    return { ok: false, cash: [], shares: [], meetings: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface VndQuarter { year: number; quarter: number; fiscalDate: string; announceDate: string | null; revenue: number | null; netProfit: number | null }

interface RawStatement { itemCode?: number; numericValue?: number; fiscalDate?: string; createdDate?: string; reportType?: string }

/** Gộp các dòng BCTC (doanh thu + LNST mẹ) thành từng quý, ngày công bố = createdDate sớm nhất của quý đó (hàm thuần). */
export function parseVndStatements(rows: RawStatement[]): VndQuarter[] {
  const by = new Map<string, VndQuarter>();
  for (const r of rows) {
    if (r.reportType && r.reportType !== "QUARTER") continue;
    const fd = r.fiscalDate?.slice(0, 10);
    if (!fd || !/^\d{4}-\d{2}-\d{2}$/.test(fd)) continue;
    const month = Number(fd.slice(5, 7));
    if (![3, 6, 9, 12].includes(month)) continue;
    const q = by.get(fd) ?? { year: Number(fd.slice(0, 4)), quarter: month / 3, fiscalDate: fd, announceDate: null, revenue: null, netProfit: null };
    const created = r.createdDate?.slice(0, 10) ?? null;
    // Chỉ nhận ngày nhập trong 1–120 ngày sau cuối quý (dữ liệu rất cũ mang ngày nạp hàng loạt, không phải ngày công bố).
    const lag = created ? (Date.parse(created) - Date.parse(fd)) / 86_400_000 : NaN;
    if (created && lag >= 1 && lag <= 120 && (!q.announceDate || created < q.announceDate)) q.announceDate = created;
    if (r.itemCode === ITEM_REVENUE && typeof r.numericValue === "number") q.revenue = r.numericValue;
    if (r.itemCode === ITEM_NPAT_PARENT && typeof r.numericValue === "number") q.netProfit = r.numericValue;
    by.set(fd, q);
  }
  return [...by.values()].sort((a, b) => b.fiscalDate.localeCompare(a.fiscalDate)); // mới -> cũ như VCI
}

export async function fetchVndQuarterlyFinancials(ticker: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}): Promise<{ available: boolean; quarters: VndQuarter[]; error?: string }> {
  try {
    const url = `${BASE}/financial_statements?q=code:${encodeURIComponent(ticker)}~reportType:QUARTER~itemCode:${ITEM_REVENUE},${ITEM_NPAT_PARENT}&size=200&sort=fiscalDate:desc`;
    const json = await getJson(url, fetchImpl);
    const quarters = parseVndStatements((json.data ?? []) as RawStatement[]);
    return { available: quarters.length > 0, quarters, error: quarters.length ? undefined : "VNDirect không có BCTC quý" };
  } catch (e) {
    return { available: false, quarters: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// Sự kiện quyền ở ĐỊNH DẠNG VCI (eventCode DIV/ISS/AGME, exrightDate, payoutDate…) — để toàn bộ luồng cũ của tab Cổ tức
// (fetchDividendEvents -> /api/cotuc/events, dividend-events-scan -> DividendEventCache, buildLifecycleEvents,
// useDividendEvents phía giao diện) nhận dữ liệu THẬT từ VNDirect mà không đổi hợp đồng nào. VCI chỉ còn là dự phòng.
//   DIVIDEND -> DIV  (exrightDate = effectiveDate = GDKHQ, payoutDate = actualDate = ngày trả, valuePerShare = dividend)
//   STOCKDIV -> ISS  "Cổ tức bằng cổ phiếu" ; KINDDIV -> ISS "Cổ phiếu thưởng" (classifyIssEvent đọc đúng 2 cụm này)
//   MEETING  -> AGME (issueDate = effectiveDate = ngày họp ĐHCĐ)
// ---------------------------------------------------------------------------

interface RawVndEvent extends RawEvent { disclosureDate?: string | null; actualDate?: string | null; typeDesc?: string | null; id?: string }

export interface VciShapedRawEvent {
  eventCode: "DIV" | "ISS" | "AGME";
  publicDate: string | null;
  exrightDate: string | null;
  issueDate: string | null;
  recordDate: null;
  payoutDate: string | null;
  listingDate: null;
  eventTitleVi: string;
  valuePerShare: number | null;
  exerciseRatio: number | null;
  source: "VNDIRECT";
}

/** Hàm thuần: sự kiện VNDirect thô -> sự kiện dạng VCI (bỏ bản EN_GB trùng, bỏ loại không liên quan). */
export function vndEventsToVciShape(rows: RawVndEvent[]): VciShapedRawEvent[] {
  const day = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
  const out: VciShapedRawEvent[] = [];
  const seen = new Set<string>();
  for (const e of rows) {
    if (e.locale && e.locale !== "VN") continue;
    const eff = day(e.effectiveDate);
    if (!eff) continue;
    const key = `${e.type}:${eff}:${e.dividend ?? ""}:${e.ratio ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { publicDate: day(e.disclosureDate), recordDate: null, listingDate: null, source: "VNDIRECT" as const };
    if (e.type === "DIVIDEND" && typeof e.dividend === "number" && e.dividend > 0) {
      out.push({ ...base, eventCode: "DIV", exrightDate: eff, issueDate: null, payoutDate: day(e.actualDate),
        eventTitleVi: e.note || `Cổ tức bằng tiền ${e.dividend.toLocaleString("vi-VN")} đ/cp`, valuePerShare: e.dividend, exerciseRatio: null });
    } else if ((e.type === "STOCKDIV" || e.type === "KINDDIV") && typeof e.ratio === "number" && e.ratio > 0) {
      const title = e.type === "STOCKDIV" ? "Cổ tức bằng cổ phiếu" : "Cổ phiếu thưởng";
      out.push({ ...base, eventCode: "ISS", exrightDate: eff, issueDate: null, payoutDate: null,
        eventTitleVi: `${title}${e.note ? ` — ${e.note}` : ""}`, valuePerShare: null, exerciseRatio: e.ratio / 100 });
    } else if (e.type === "MEETING") {
      out.push({ ...base, eventCode: "AGME", exrightDate: null, issueDate: eff, payoutDate: null,
        eventTitleVi: e.note || e.typeDesc || "Họp ĐHĐCĐ", valuePerShare: null, exerciseRatio: null });
    }
  }
  return out;
}

/** Sự kiện quyền dạng VCI của một mã trong [from, to] (ISO). */
export async function fetchVndEventsVciShape(
  ticker: string, from: string, to: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; events: VciShapedRawEvent[] } | { ok: false; error: string }> {
  try {
    const q = `code:${encodeURIComponent(ticker)}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING~effectiveDate:gte:${from}~effectiveDate:lte:${to}`;
    const json = await getJson(`${BASE}/events?q=${q}&sort=effectiveDate:desc&size=300`, fetchImpl);
    return { ok: true, events: vndEventsToVciShape((json.data ?? []) as RawVndEvent[]) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sự kiện quyền dạng VCI cho NHIỀU mã trong MỘT lượt (lọc `code:A,B,C…`, tối đa 100 mã/request) — danh mục ~300 mã
 * chỉ tốn 3 request (~2 giây) thay vì 300. Mã không có sự kiện nào vẫn có mặt với danh sách rỗng.
 */
export async function fetchVndEventsVciShapeBulk(
  tickers: string[], from: string, to: string, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: true; byTicker: Map<string, VciShapedRawEvent[]> } | { ok: false; error: string }> {
  const byTicker = new Map<string, VciShapedRawEvent[]>(tickers.map((t) => [t, []]));
  try {
    for (let i = 0; i < tickers.length; i += 100) {
      const codes = tickers.slice(i, i + 100).map(encodeURIComponent).join(",");
      const q = `code:${codes}~locale:VN~group:investorRight~type:DIVIDEND,STOCKDIV,KINDDIV,MEETING~effectiveDate:gte:${from}~effectiveDate:lte:${to}`;
      const json = await getJson(`${BASE}/events?q=${q}&sort=effectiveDate:desc&size=10000`, fetchImpl, 30_000);
      const rows = (json.data ?? []) as (RawVndEvent & { code?: string })[];
      const grouped = new Map<string, RawVndEvent[]>();
      for (const r of rows) {
        const c = r.code?.toUpperCase();
        if (c && byTicker.has(c)) grouped.set(c, [...(grouped.get(c) ?? []), r]);
      }
      for (const [c, list] of grouped) byTicker.set(c, vndEventsToVciShape(list));
    }
    return { ok: true, byTicker };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
