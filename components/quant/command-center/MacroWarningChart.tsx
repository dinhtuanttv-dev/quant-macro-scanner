// components/quant/command-center/MacroWarningChart.tsx
// Molecule: Bieu do canh bao som vi mo (USD/VND sparkline + ghi chu TPCP tam an).
// Du lieu lay tu TickerMarquee context hoac props truyen xuong tu page.tsx.

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";

interface UsdPoint { date: string; value: number; }

interface Props {
  usdVndPoints?: UsdPoint[]; // neu khong co truyen vao, hien placeholder
}

export const MacroWarningChart = React.memo(function MacroWarningChart({ usdVndPoints = [] }: Props) {
  // Ve sparkline don gian bang SVG polyline, khong phu thuoc thu vien bieu do nang
  const H = 80;
  const W = 280;
  const points = usdVndPoints.length >= 2 ? usdVndPoints : null;

  let polylinePoints = "";
  if (points) {
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    polylinePoints = points.map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p.value - min) / range) * (H - 10) - 5;
      return `${x},${y}`;
    }).join(" ");
  }

  return (
    <div
      style={{ background: cardGradient, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg }}
    >
      <div style={{ fontSize: fontSize.xs, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.03em", color: colors.amberLight, marginBottom: spacing.sm }}>
        📡 Canh bao som vi mo · Macro Early Warning
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: "block" }}>
        {polylinePoints ? (
          <polyline points={polylinePoints} fill="none"
            stroke={colors.amber} strokeWidth={1.8} strokeLinecap="round" />
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill={colors.muted}
            fontSize={11}>Chua co du lieu USD/VND</text>
        )}
      </svg>

      <div style={{ display: "flex", gap: spacing.lg, fontSize: fontSize.xs,
        color: colors.muted, marginTop: spacing.xs }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%",
            background: colors.amber, display: "inline-block" }} />
          USD/VND
        </span>
        <span style={{ fontStyle: "italic", color: colors.mutedDark }}>
          * Loi suat TPCP 10 nam: chua co nguon du lieu, tam an
        </span>
      </div>
    </div>
  );
});
