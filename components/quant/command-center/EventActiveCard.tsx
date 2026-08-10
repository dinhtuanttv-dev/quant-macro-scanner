// components/quant/command-center/EventActiveCard.tsx
// Atom: 1 the su kien dang tac dong. ActiveEventsRow lap component nay x3.

"use client";

import React from "react";
import {
  colors, cardGradient, radius, spacing, fontSize, scenarioColors,
} from "@/lib/design-tokens";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

interface Props {
  event: MacroEventSummary;
}

export const EventActiveCard = React.memo(function EventActiveCard({ event }: Props) {
  const token = event.direction === "benefit" ? scenarioColors.growth : scenarioColors.defensive;
  // % thanh bar: su kien cang gan -> thanh cang day (max 30 ngay = 100%)
  const barPct = Math.max(6, Math.min(100, Math.round((1 - event.daysRemaining / 90) * 100)));

  return (
    <div
      style={{
        background: cardGradient,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: `${spacing.md} ${spacing.lg}`,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{ fontSize: fontSize.xs, color: colors.muted, textTransform: "uppercase",
          letterSpacing: "0.05em", marginBottom: spacing.xs }}
      >
        Su kien
      </div>
      <div
        style={{ fontSize: fontSize.md, fontWeight: 800, color: colors.text,
          marginBottom: spacing.sm, minHeight: 36,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
      >
        {event.title}
      </div>
      <div
        style={{ fontSize: fontSize.xl, fontWeight: 900, color: token.main,
          fontVariantNumeric: "tabular-nums" }}
      >
        Con lai: {Math.ceil(event.daysRemaining)} ngay
      </div>
      {/* Thanh tien do: cang gan ngay thuc thi cang day */}
      <div
        style={{ height: 3, borderRadius: 2, marginTop: spacing.sm,
          background: colors.border, overflow: "hidden" }}
      >
        <div style={{ height: "100%", width: `${barPct}%`, background: token.main,
          borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
});
