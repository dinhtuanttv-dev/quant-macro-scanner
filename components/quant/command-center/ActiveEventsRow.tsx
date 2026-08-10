// components/quant/command-center/ActiveEventsRow.tsx
// Molecule: Dai 3 the su kien chinh dang tac dong, nam tren dau cot phai.

"use client";

import React from "react";
import { spacing, fontSize, colors } from "@/lib/design-tokens";
import { EventActiveCard } from "./EventActiveCard";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

interface Props {
  events: MacroEventSummary[];
}

export const ActiveEventsRow = React.memo(function ActiveEventsRow({ events }: Props) {
  const display = events.slice(0, 3);

  if (display.length === 0) {
    return (
      <div style={{ fontSize: fontSize.sm, color: colors.muted, padding: spacing.lg,
        textAlign: "center" }}>
        Khong co su kien vi mo sap thuc thi
      </div>
    );
  }

  return (
    <div style={{ marginBottom: spacing.lg }}>
      <div style={{ fontSize: fontSize.xs, color: colors.muted, textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: spacing.sm, fontWeight: 700 }}>
        🔥 Cac su kien chinh dang tac dong · Key Active Events
      </div>
      <div style={{ display: "flex", gap: spacing.md }}>
        {display.map((ev) => (
          <EventActiveCard key={ev.sourceId} event={ev} />
        ))}
      </div>
    </div>
  );
});
