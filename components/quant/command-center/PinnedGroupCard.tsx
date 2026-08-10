// components/quant/command-center/PinnedGroupCard.tsx
// Atom: 1 nhom su kien da duoc ghim (1 su kien, nhieu ma). React.memo vi props on dinh.

"use client";

import React from "react";
import { colors, radius, spacing, fontSize } from "@/lib/design-tokens";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

interface Props {
  event: MacroEventSummary;
  tickers: string[];
  onUnpin: (ticker: string) => void;
}

export const PinnedGroupCard = React.memo(function PinnedGroupCard({ event, tickers, onUnpin }: Props) {
  const dirColor = event.direction === "benefit" ? colors.emeraldLight : colors.red;

  return (
    <div
      style={{
        background: "rgba(2,6,15,0.4)",
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: `${spacing.sm} ${spacing.md}`,
        marginBottom: spacing.sm,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "center", marginBottom: spacing.xs }}>
        <span style={{ fontSize: fontSize.sm, fontWeight: 700, color: colors.violet,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {event.title}
        </span>
        <span style={{ fontSize: fontSize.xs, color: colors.muted,
          flexShrink: 0, marginLeft: spacing.sm }}>
          con {Math.ceil(event.daysRemaining)} ngay
        </span>
      </div>

      <div style={{ display: "flex", gap: spacing.xs, flexWrap: "wrap" }}>
        {tickers.map((t) => (
          <span
            key={t}
            style={{
              background: "rgba(245,158,11,0.1)", color: colors.amberLight,
              fontSize: fontSize.xs, fontWeight: 700,
              padding: "2px 8px", borderRadius: 999,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            {t}
            <button
              onClick={() => onUnpin(t)}
              style={{ background: "none", border: "none", color: colors.muted,
                cursor: "pointer", fontSize: 10, padding: 0 }}
              title={`Bo ghim ${t}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div style={{ fontSize: fontSize.xs, color: dirColor, marginTop: spacing.xs }}>
        {event.direction === "benefit" ? "▲ Huong loi" : "▼ Rui ro"}
        {" · "}
        <span style={{ color: colors.muted }}>{event.category}</span>
      </div>
    </div>
  );
});
