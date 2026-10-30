// 31/10/2026 — Nguồn tin của Catalyst Engine: Event Radar trên Market Gateway, thay MacroNewsRecord trong Neon (hết hạn mức từ ~10/10,
// làm engine ngừng quét). Hàm thuần: sự kiện Radar -> CatalystSource + ImpactEdge đúng định dạng engine; engine và công thức không đổi.
//
// Chiều tác động (benefit/harm) — quy tắc đặt trước, CHƯA kiểm chứng (nhãn THỬ NGHIỆM của tab vẫn giữ):
//   1. Bảng chính sách: "giảm lãi suất", "giảm thuế"… là tích cực; "tăng lãi suất", "siết"… là tiêu cực. Bộ phân loại cũ coi mọi chữ
//      "giảm" là xấu, nên chính sách nới lỏng bị chấm ngược chiều.
//   2. Còn lại: điểm cảm xúc có xử lý phủ định của Radar; |điểm| < MIN_SENTIMENT là trung lập -> không tạo tác động (X1).
// Mã ghép: chỉ mã nêu NGAY TRONG TIÊU ĐỀ, hoặc mã do nguồn công bố gắn sẵn; mã chỉ được nhắc trong tóm tắt không tính.
// Độ tin cậy: công bố gắn mã hoặc từ 2 nguồn trở lên là "confirmed"; một báo đơn lẻ là "rumor" (trọng số 0,5 theo computeCredibilityWeight).
import { classifyImpact, classifySectors, toSeverity } from "@/lib/macro/classifier";
import { resolveSectorNameSync } from "./engine/SectorRegistry";
import type { CatalystCategory, CatalystSource, Horizon, ImpactDirection, ImpactEdge } from "./types";

export interface RadarEventLike {
  eventId: string; title: string; url?: string | null; publishedAt?: string | null; firstSeenAt: string;
  eventType: string; sentiment?: number | null; severityScore?: number | null; sourceAuthority?: string | null;
  corroborationCount?: number | null; tickers?: string[]; titleTickers?: string[];
}

export const MIN_SENTIMENT = 0.3;
export const GRAPH_RETENTION_DAYS = 120;

/** Loại tin có hướng tác động. Cổ tức, phát hành, ĐHĐCĐ, nhân sự, diễn biến giá: trung lập hoặc không phải chất xúc tác -> bỏ. */
const CATEGORY: Record<string, CatalystCategory> = {
  EARNINGS: "earnings", MNA: "ma", LEGAL: "regulatory", RATING: "rating", CONTRACT: "contract", INSIDER: "insider",
  MONETARY_POLICY: "regulatory", FISCAL_POLICY: "regulatory", MARKET_STRUCTURE: "regulatory",
  MACRO_DATA: "macro", MACRO_NEWS: "macro", SYSTEMIC_STRESS: "macro",
};
const COMPANY_TYPES = new Set(["EARNINGS", "MNA", "LEGAL", "RATING", "CONTRACT", "INSIDER"]);
export const RADAR_CATALYST_TYPES = Object.keys(CATEGORY);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

const POLICY_POSITIVE = /(giam lai suat|ha lai suat|giam thue|mien thue|gian thue|giam phi|bom rong|bom tien|noi long|ho tro thanh khoan|nang hang thi truong|nang hang chung khoan|tang room tin dung|mo room)/;
const POLICY_NEGATIVE = /(tang lai suat|tang thue|thue doi ung|thue quan|siet|that chat|hut rong|cam van|vo no|khung hoang|chien tranh|thien tai|dong dat)/;

export function directionOf(title: string, sentiment: number | null | undefined): ImpactDirection | null {
  const t = fold(title);
  const pos = POLICY_POSITIVE.test(t), neg = POLICY_NEGATIVE.test(t);
  if (pos !== neg) return pos ? "benefit" : "harm";
  if (pos && neg) return null; // hai chiều trong cùng tiêu đề: không đoán
  const s = Number(sentiment);
  if (!Number.isFinite(s) || Math.abs(s) < MIN_SENTIMENT) return null;
  return s > 0 ? "benefit" : "harm";
}

/** Như mapSeverity của luồng tin cũ. */
function decayOf(severity: string): { decayRate: number; horizon: Horizon } {
  switch (severity) {
    case "critical": return { decayRate: 0.05, horizon: "long" };
    case "high": return { decayRate: 0.08, horizon: "long" };
    case "low": return { decayRate: 0.25, horizon: "short" };
    default: return { decayRate: 0.15, horizon: "medium" };
  }
}

export interface RadarConversion { sources: CatalystSource[]; edges: ImpactEdge[]; stats: { convertedCount: number; skippedCount: number; errorCount: number; unmappedSectorCount: number } }

/** `sectorOf`: ngành chuẩn của engine theo mã (không có -> chỉ tạo tác động lên mã). */
export function radarEventsToGraph(events: RadarEventLike[], sectorOf: (ticker: string) => string | null = () => null): RadarConversion {
  const sources: CatalystSource[] = [];
  const edges: ImpactEdge[] = [];
  let skippedCount = 0, unmappedSectorCount = 0;
  for (const e of events) {
    const category = CATEGORY[e.eventType];
    const direction = category ? directionOf(e.title, e.sentiment) : null;
    if (!category || !direction) { skippedCount++; continue; }
    const disclosure = e.sourceAuthority === "disclosure_tagged_aggregator" || e.sourceAuthority === "configured_official_feed";
    const tickers = [...new Set(disclosure ? e.tickers ?? [] : e.titleTickers ?? [])];
    const titleSectors: string[] = [];
    for (const raw of classifySectors(e.title)) {
      const name = resolveSectorNameSync(raw);
      if (name) titleSectors.push(name);
      else if (raw !== "Macro_General") unmappedSectorCount++;
    }
    // Tin doanh nghiệp phải có mã; tin vĩ mô phải chỉ ra được ngành hoặc mã — không thì không biết tác động lên đâu.
    if (COMPANY_TYPES.has(e.eventType) ? !tickers.length : !tickers.length && !titleSectors.length) { skippedCount++; continue; }

    const magnitude = Math.max(Math.abs(classifyImpact(e.title)), [0, 2, 3, 5, 8][Number(e.severityScore) || 0] ?? 0);
    const { decayRate, horizon } = decayOf(toSeverity(magnitude));
    const strength = 0.5 + 0.5 * Math.min(1, Math.abs(Number(e.sentiment) || 0)); // tin lệch rõ một chiều nặng hơn, tối thiểu 50%
    const baseWeight = Math.max(1, Math.min(10, Math.round(magnitude * strength * 100) / 100));
    const corroborationCount = Math.max(1, Number(e.corroborationCount) || 1);
    const publishedDate = new Date(e.publishedAt ?? e.firstSeenAt);
    if (!Number.isFinite(publishedDate.getTime())) { skippedCount++; continue; }
    sources.push({
      id: e.eventId, title: e.title, category, sourceCredibility: disclosure || corroborationCount >= 2 ? "confirmed" : "rumor",
      publishedDate, executionDate: null, firstDetectedAt: new Date(e.firstSeenAt), corroborationCount, sourceUrl: e.url ?? null,
    });
    const edge = (targetType: "sector" | "ticker", targetId: string, hopCount: number, propagationDistance: ImpactEdge["propagationDistance"]) =>
      edges.push({ id: `${e.eventId}:${targetType}:${targetId}`, sourceId: e.eventId, targetType, targetId, direction, propagationDistance, hopCount, baseWeight, decayRate, horizon });
    for (const s of new Set(titleSectors)) edge("sector", s, 1, "direct");
    for (const t of tickers) edge("ticker", t, 1, "direct");
    // Ngành suy từ mã (tin doanh nghiệp): lan tác động yếu hơn lên ngành (hệ số 0,5 × suy giảm theo bước), để thẻ mã hiện đúng ngành.
    for (const s of new Set(tickers.map(sectorOf).filter((x): x is string => !!x && !titleSectors.includes(x)))) edge("sector", s, 2, "downstream");
  }
  return { sources, edges, stats: { convertedCount: sources.length, skippedCount, errorCount: 0, unmappedSectorCount } };
}

export interface CatalystGraph { sources: CatalystSource[]; edges: ImpactEdge[] }

/** Đồ thị lưu dạng JSON -> Date thật cho engine. */
export function reviveGraph(raw: unknown): CatalystGraph {
  const g = (raw ?? {}) as { sources?: Record<string, unknown>[]; edges?: ImpactEdge[] };
  const date = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    edges: g.edges ?? [],
    sources: (g.sources ?? []).map((s) => ({ ...s, publishedDate: date(s.publishedDate)!, firstDetectedAt: date(s.firstDetectedAt)!, executionDate: date(s.executionDate) }) as unknown as CatalystSource),
  };
}

/** Gộp theo id (bản mới thắng), bỏ tin quá GRAPH_RETENTION_DAYS (tác động đã suy giảm về gần 0) và sự kiện lịch đã qua lâu. */
export function mergeGraph(old: CatalystGraph, next: CatalystGraph, now = Date.now()): CatalystGraph {
  const cutoff = now - GRAPH_RETENTION_DAYS * 86_400_000;
  const sources = new Map(old.sources.map((s) => [s.id, s]));
  for (const s of next.sources) sources.set(s.id, s);
  const kept = [...sources.values()].filter((s) => (s.executionDate ?? s.publishedDate).getTime() >= cutoff);
  const ids = new Set(kept.map((s) => s.id));
  const replaced = new Set(next.sources.map((s) => s.id));
  const edges = new Map(old.edges.filter((e) => ids.has(e.sourceId) && !replaced.has(e.sourceId)).map((e) => [e.id, e]));
  for (const e of next.edges) if (ids.has(e.sourceId)) edges.set(e.id, e);
  return { sources: kept, edges: [...edges.values()] };
}
