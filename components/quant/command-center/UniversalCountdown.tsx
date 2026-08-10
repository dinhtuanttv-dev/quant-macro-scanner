// components/quant/command-center/UniversalCountdown.tsx
// Atom: Dong ho dem nguoc su kien lon nhat (hh:mm:ss, cap nhat moi giay).
// setInterval dat BEN TRONG component, state dem giay la cuc bo - KHONG day len
// component cha, tranh toan bo page.tsx re-render moi giay.

"use client";

import React, { useState, useEffect } from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

interface Props {
  event: MacroEventSummary | null;
}

function formatCountdown(executionDate: string): string {
  const target = new Date(executionDate).getTime();
  const diff = target - Date.now();
  if (diff <= 0) return "00:00:00";

  const h = Math.floor(diff / (1000 * 3600));
  const m = Math.floor((diff % (1000 * 3600)) / (1000 * 60));
  const s = Math.floor((diff % (1000 * 60)) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export const UniversalCountdown = React.memo(function UniversalCountdown({ event }: Props) {
  // State cuc bo - chi UniversalCountdown re-render moi giay, khong lan ra cha
  const [timeStr, setTimeStr] = useState<string>(
    event ? formatCountdown(event.executionDate) : "--:--:--"
  );

  useEffect(() => {
    if (!event) { setTimeStr("--:--:--"); return; }
    setTimeStr(formatCountdown(event.executionDate));
    const id = setInterval(() => setTimeStr(formatCountdown(event.executionDate)), 1000);
    return () => clearInterval(id);
  }, [event?.executionDate]);

  const daysLeft = event ? Math.ceil(event.daysRemaining) : null;

  return (
    <div
      style={{
        background: cardGradient,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        padding: `${spacing.md} ${spacing.xl}`,
        textAlign: "center",
        flex: 1,
      }}
    >
      <div style={{ fontSize: fontSize.xs, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: spacing.xs }}>
        Dong ho dem nguoc su kien lon nhat · Universal Countdown
      </div>
      <div
        style={{ fontSize: fontSize.md, fontWeight: 800, color: colors.amberLight, marginBottom: spacing.xs }}
      >
        {event ? event.title : "Khong co su kien sap toi"}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: spacing.sm }}>
        {daysLeft !== null && (
          <span style={{ fontSize: fontSize["2xl"], fontWeight: 900, color: colors.text }}>
            {daysLeft}
          </span>
        )}
        {daysLeft !== null && (
          <span style={{ fontSize: fontSize.lg, color: colors.muted }}>ngay</span>
        )}
        <span
          style={{
            fontSize: fontSize["2xl"],
            fontWeight: 900,
            color: colors.amberLight,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeStr}
        </span>
      </div>
      <div style={{ fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs }}>
        Cap nhat theo thoi gian thuc
      </div>
    </div>
  );
});
