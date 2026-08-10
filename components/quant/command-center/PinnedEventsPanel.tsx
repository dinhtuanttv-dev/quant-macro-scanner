// components/quant/command-center/PinnedEventsPanel.tsx
// Organism: Panel tong hop su kien da ghim, thay the vi tri Compare Tool cu.
// Nhom nguoc lai theo eventId, hien PinnedGroupCard cho moi nhom.

"use client";

import React, { useMemo } from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import { PinnedGroupCard } from "./PinnedGroupCard";
import type { MacroEventSummary, PinMap } from "@/lib/types/siu-quet-ai";

interface Props {
  pins: PinMap;
  events: MacroEventSummary[];
  onUnpin: (ticker: string) => void;
}

export const PinnedEventsPanel = React.memo(function PinnedEventsPanel({ pins, events, onUnpin }: Props) {
  // Nhom ticker theo eventId: { eventId: ticker[] }
  const groups = useMemo(() => {
    const map: Record<string, string[]> = {};
    Object.entries(pins).forEach(([ticker, eventId]) => {
      (map[eventId] = map[eventId] ?? []).push(ticker);
    });
    return map;
  }, [pins]);

  const eventIds = Object.keys(groups);
  const isEmpty = eventIds.length === 0;

  return (
    <div
      style={{
        background: cardGradient, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, padding: spacing.lg, marginTop: spacing.lg,
      }}
    >
      <div style={{ fontSize: fontSize.xs, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.03em", color: colors.amberLight, marginBottom: spacing.md }}>
        📌 Su kien da ghim vao co phieu
      </div>

      {isEmpty ? (
        <div style={{ fontSize: fontSize.sm, color: colors.muted,
          textAlign: "center", padding: spacing.xl }}>
          Chua ghim su kien nao — bam 📌 tren bat ky ma nao trong bang Top 20 de bat dau.
        </div>
      ) : (
        eventIds.map((eid) => {
          const ev = events.find((e) => e.sourceId === eid);
          if (!ev) return null;
          return (
            <PinnedGroupCard
              key={eid}
              event={ev}
              tickers={groups[eid]}
              onUnpin={onUnpin}
            />
          );
        })
      )}
    </div>
  );
});
