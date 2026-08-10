// components/quant/command-center/FearGreedGauge.tsx
// Atom: Dong ho tam ly thi truong (SVG ban nguyet). React.memo vi chi nhan
// score: number nguyen thuy - khong bi re-render khi component cha doi state khac.

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import type { FearGreedResult } from "@/lib/types/siu-quet-ai";

interface Props {
  data: FearGreedResult;
}

function scoreToColor(score: number): string {
  if (score >= 75) return colors.emeraldLight;
  if (score >= 60) return colors.emerald;
  if (score >= 40) return colors.yellow;
  if (score >= 25) return colors.amber;
  return colors.red;
}

// Kim chi huong tinh tu score 0-100 -> goc xoay -90deg den +90deg
function scoreToRotate(score: number): number {
  return -90 + (score / 100) * 180;
}

export const FearGreedGauge = React.memo(function FearGreedGauge({ data }: Props) {
  const needleColor = scoreToColor(data.score);
  const rotate = scoreToRotate(data.score);

  return (
    <div
      style={{
        background: cardGradient, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg,
      }}
    >
      <div
        style={{
          fontSize: fontSize.xs, fontWeight: 800, textTransform: "uppercase",
          letterSpacing: "0.03em", color: colors.amberLight, marginBottom: spacing.sm,
        }}
      >
        😨 Chi so tam ly thi truong
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: spacing.lg }}>
        {/* SVG gauge ban nguyet */}
        <svg width={120} height={68} viewBox="0 0 180 100" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="fgGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.red} />
              <stop offset="50%" stopColor={colors.yellow} />
              <stop offset="100%" stopColor={colors.emeraldLight} />
            </linearGradient>
          </defs>
          {/* Vong cung mau */}
          <path
            d="M 10 90 A 80 80 0 0 1 170 90"
            fill="none" stroke="url(#fgGrad2)"
            strokeWidth={14} strokeLinecap="round"
          />
          {/* Kim chi */}
          <line
            x1={90} y1={90} x2={90} y2={20}
            stroke={colors.text} strokeWidth={3} strokeLinecap="round"
            transform={`rotate(${rotate} 90 90)`}
            style={{ transition: "transform 0.6s ease" }}
          />
          <circle cx={90} cy={90} r={5} fill={colors.text} />
        </svg>

        <div>
          <div style={{ fontSize: 26, fontWeight: 900, color: needleColor,
            fontVariantNumeric: "tabular-nums" }}>
            {data.score}
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.muted }}>{data.label}</div>
          <div
            style={{
              display: "inline-block", fontSize: fontSize.xs,
              background: "rgba(148,163,184,0.12)", color: colors.muted,
              padding: "2px 8px", borderRadius: 999, marginTop: spacing.xs,
            }}
          >
            ⚠ Uoc tinh (proxy VIX + do rong TT)
          </div>
        </div>
      </div>
    </div>
  );
});
