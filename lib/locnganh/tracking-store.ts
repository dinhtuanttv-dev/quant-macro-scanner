// MV0 (25/10/2026) — sổ theo dõi tín hiệu ngành nằm trong kho Gateway (bảng `sectortrack`): chuyển dòng kho về SectorTrackRow.
import { withDates } from "@/lib/cotuc/store/gateway-store";
import type { SectorTrackRow } from "@/lib/locnganh/tracking";
import type { DecisionLevel } from "@/lib/cotuc/timing-v3/decision/decision-types";

/** Dòng kho -> SectorTrackRow (thời điểm dạng ISO; outcome 0/1). */
export function toTrack(r: Record<string, unknown>): SectorTrackRow {
  const d = withDates(r, ["issuedAt", "outcomeRecordedAt"] as const);
  return {
    ...(r as unknown as SectorTrackRow), level: r.level as DecisionLevel, components: (r.components ?? []) as SectorTrackRow["components"],
    issuedAt: d.issuedAt!.toISOString(), outcome: r.outcome == null ? null : r.outcome ? 1 : 0, outcomeRecordedAt: d.outcomeRecordedAt?.toISOString() ?? null,
  };
}

