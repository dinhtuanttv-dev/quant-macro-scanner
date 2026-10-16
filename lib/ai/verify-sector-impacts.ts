// lib/ai/verify-sector-impacts.ts — kiểm chứng KẾT LUẬN AI BẰNG CODE (2026-10-17), bổ sung cho Evidence Agent (vốn cũng là LLM).
//   1. sectorKey phải là mã ICB có trong bảng ngành Gateway;
//   2. mọi evidenceRefs phải là ID data point THẬT đã đưa cho agent; không có ref hợp lệ -> không kiểm chứng được;
//   3. direction không được TRÁI CHIỀU với điểm định lượng ngắn hạn khi |điểm| ≥ 0,5 (thuận gió ↔ bearish, ngược gió ↔ bullish);
// Vi phạm -> verified = false, confidence ≤ 0,3, ghi lý do vào discrepancies. Không bao giờ nâng confidence.
import type { DataPoint, WsSectorInfo } from "./world-context";

export interface RawImpact { sectorKey: string; direction: "bullish" | "bearish" | "neutral"; confidence: number; reasoningVi: string; evidenceRefs: string[] }
export interface CheckedImpact extends RawImpact { verified: boolean; discrepancies: string[]; quant: { shortScore: number | null; shortLabel: string; mediumScore: number | null; shortEvidence: string } | null; vnTickers: string[]; sectorNameVi: string | null }

export function verifySectorImpacts(impacts: RawImpact[], dataPoints: DataPoint[], sectors: Map<string, WsSectorInfo>, llm: Map<string, { verified: boolean; finalConfidence: number; discrepancies: string[] }> = new Map()): CheckedImpact[] {
  const ids = new Set(dataPoints.map((d) => d.id));
  const out: CheckedImpact[] = [];
  const seen = new Set<string>();
  for (const s of impacts) {
    const key = String(s.sectorKey ?? "").replace(/^ICB:?/i, "").trim();
    const info = sectors.get(key);
    if (!info || seen.has(key)) continue; // khoá không hợp lệ / trùng -> bỏ (không bịa ngành)
    seen.add(key);
    const disc: string[] = [];
    const refs = (s.evidenceRefs ?? []).filter((r) => ids.has(r));
    const bad = (s.evidenceRefs ?? []).filter((r) => !ids.has(r));
    if (bad.length) disc.push(`Trích dẫn không tồn tại trong dữ liệu: ${bad.join(", ")}`);
    if (!refs.length) disc.push("Không có trích dẫn hợp lệ nào");
    const strong = info.shortScore != null && Math.abs(info.shortScore) >= 0.5;
    if (strong && ((info.shortLabel === "tailwind" && s.direction === "bearish") || (info.shortLabel === "headwind" && s.direction === "bullish"))) {
      disc.push(`Trái chiều với điểm định lượng ngắn hạn (${info.shortScore! > 0 ? "+" : ""}${info.shortScore!.toFixed(2)} σ, ${info.shortLabel === "tailwind" ? "thuận gió" : "ngược gió"})`);
    }
    const v = llm.get(key) ?? llm.get(s.sectorKey);
    if (v && !v.verified) disc.push(...(v.discrepancies ?? []));
    const verified = disc.length === 0 && (v ? v.verified : true);
    const base = Math.max(0, Math.min(1, Number(s.confidence) || 0));
    const conf = Math.min(base, v ? v.finalConfidence : base);
    out.push({
      ...s, sectorKey: key, evidenceRefs: refs, verified, discrepancies: disc, confidence: verified ? conf : Math.min(0.3, conf),
      quant: { shortScore: info.shortScore, shortLabel: info.shortLabel, mediumScore: info.mediumScore, shortEvidence: info.shortEvidence },
      vnTickers: info.constituents, sectorNameVi: info.nameVi,
    });
  }
  return out;
}
