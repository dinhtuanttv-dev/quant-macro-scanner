// lib/ai/world-context.ts — đầu vào cho Phân tích AI đa tác nhân (Gemini) từ Market Gateway (2026-10-17).
// Trước đây Market Agent chỉ nhận 10 dòng chỉ số từ bảng Supabase `world_market_pulse` (có thể trễ nhiều giờ) và kết luận theo
// 15 khoá ngành đặt tay. Giờ nhận dữ liệu CÓ NGÀY từ Gateway:
//   /api/world/pulse            — chỉ số thế giới + DXY/VIX/US10Y/vàng/dầu (Yahoo, kèm phiên)
//   /api/commodities/snapshot   — 19 hàng hoá (Yahoo ngày / World Bank Pink Sheet tháng)
//   /api/world-sectors/scores   — điểm thuận/ngược gió 22 ngành ICB VN (kiểm định đặt trước WS-v1)
//   /api/market/sectors/rrg     — thành phần + tỷ trọng thật của từng ngành ICB
// Mỗi data point có ID ổn định để agent trích dẫn và để code kiểm chứng (verify-sector-impacts.ts).
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export interface DataPoint { id: string; label: string; value: number | string; timestamp: string }
export interface WsSectorInfo { icb: string; nameVi: string; shortScore: number | null; shortLabel: string; mediumScore: number | null; mediumLabel: string; shortEvidence: string; constituents: string[] }
export interface WorldAiContext { ok: boolean; dataPoints: DataPoint[]; sectors: Map<string, WsSectorInfo>; evidenceVi: string | null; generatedAt: string; errors: string[] }

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const f = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const sgn = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(d)}` : "—");
const LABEL_VI: Record<string, string> = { tailwind: "thuận gió", headwind: "ngược gió", neutral: "trung tính", na: "chưa có thông tin mới" };

/** Dựng data point + bảng ngành từ 4 tài liệu Gateway (hàm thuần, có test). */
export function buildWorldAiContext(docs: { pulse: Json | null; commodities: Json | null; scores: Json | null; rrg: Json | null }, nowIso: string): WorldAiContext {
  const dp: DataPoint[] = [];
  const errors: string[] = [];
  const pulse = docs.pulse;
  if (pulse?.macro?.quotes) {
    for (const [k, q] of Object.entries<Json>(pulse.macro.quotes)) dp.push({ id: `mc:${k}`, label: `${q.nameVi} (${q.symbol})`, value: `${f(q.value)} (${sgn(q.changePct)}% so với phiên trước)`, timestamp: q.date });
  } else errors.push("pulse");
  for (const m of pulse?.markets ?? []) dp.push({ id: `mk:${m.symbol}`, label: m.name, value: `${f(m.value)} (${sgn(m.change_percent)}%)`, timestamp: m.date ?? m.fetched_at });
  if (docs.commodities?.items) {
    for (const c of docs.commodities.items) {
      if (!c.available) continue;
      dp.push({ id: `cm:${c.id}`, label: `${c.nameVi} (${c.unit})`, value: `${f(c.value)} (${sgn(c.change?.pct)}% ${c.change?.basisVi ?? ""}${c.yoyPct != null ? `; ${sgn(c.yoyPct, 1)}% so với cùng kỳ` : ""})`, timestamp: c.period });
    }
  } else errors.push("commodities");
  const constituents = new Map<string, string[]>();
  for (const s of docs.rrg?.sectors ?? []) constituents.set(s.code, (s.constituents ?? []).slice().sort((a: Json, b: Json) => b.weight - a.weight).slice(0, 5).map((x: Json) => x.ticker));
  const sectors = new Map<string, WsSectorInfo>();
  if (docs.scores?.rows) {
    for (const r of docs.scores.rows) {
      if (!r.available) continue;
      const regions = Object.entries<Json>(r.short?.sectors?.byRegion ?? {}).map(([k, v]) => `${k} ${sgn(v.z)}`).join(", ") || "chưa có phiên mới";
      const info: WsSectorInfo = {
        icb: r.icb, nameVi: r.nameVi, shortScore: r.short?.score ?? null, shortLabel: r.short?.label ?? "na", mediumScore: r.medium?.score ?? null, mediumLabel: r.medium?.label ?? "na",
        shortEvidence: r.short?.evidence?.label ?? "EXPERIMENTAL", constituents: constituents.get(r.icb) ?? [],
      };
      sectors.set(r.icb, info);
      dp.push({
        id: `ws:${r.icb}`,
        label: `Ngành VN ${r.nameVi} (ICB ${r.icb}) — điểm ngành thế giới`,
        value: `ngắn hạn ${sgn(info.shortScore)} σ (${LABEL_VI[info.shortLabel] ?? info.shortLabel}; ${regions}${r.short?.commodity != null ? `; hàng hoá ${sgn(r.short.commodity)}` : ""}) · trung hạn 3T ${sgn(info.mediumScore)} σ (${LABEL_VI[info.mediumLabel] ?? info.mediumLabel}) · bằng chứng ngắn hạn: ${info.shortEvidence === "EVIDENCE" ? "đạt kiểm định cấp ngành" : "thăm dò"}`,
        timestamp: r.vnLast ?? nowIso,
      });
    }
  } else errors.push("world-sectors");
  return {
    ok: dp.length > 0 && sectors.size > 0, dataPoints: dp, sectors, generatedAt: nowIso, errors,
    evidenceVi: docs.scores?.evidence?.reasonVi ?? null,
  };
}

async function getJson(path: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<Json | null> {
  try {
    const r = await fetchImpl(`${MARKET_GATEWAY_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function fetchWorldAiContext(fetchImpl: typeof fetch = fetch): Promise<WorldAiContext> {
  const [pulse, commodities, scores, rrg] = await Promise.all([
    getJson("/api/world/pulse", 20_000, fetchImpl),
    getJson("/api/commodities/snapshot", 30_000, fetchImpl),
    getJson("/api/world-sectors/scores", 40_000, fetchImpl),
    getJson("/api/market/sectors/rrg", 20_000, fetchImpl),
  ]);
  return buildWorldAiContext({ pulse, commodities, scores, rrg }, new Date().toISOString());
}
