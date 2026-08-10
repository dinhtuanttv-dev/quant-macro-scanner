// components/quant/command-center/MarketStatusIndicator.tsx
// Atom: Den trang thai thi truong (chấm màu + nhãn + mô tả phụ).
// Nhan mau tu scenarioColors trong design-tokens, khong hard-code hex.

"use client";

import React from "react";
import { colors, scenarioColors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import type { Scenario, MarketStatusResult } from "@/lib/types/siu-quet-ai";

interface Props {
  status: MarketStatusResult;
}

const SCENARIO_LABEL_VI: Record<Scenario, string> = {
  growth: "Thi truong tang truong",
  cautious: "Can trong, theo doi sat",
  defensive: "Phong thu, han che rui ro",
};

export const MarketStatusIndicator = React.memo(function MarketStatusIndicator({ status }: Props) {
  const token = scenarioColors[status.level];

  return (
    <div
      style={{
        background: cardGradient,
        border: `1px solid ${token.border}`,
        borderLeft: `4px solid ${token.main}`,
        borderRadius: radius.xl,
        padding: `${spacing.lg} ${spacing.xl}`,
        display: "flex",
        alignItems: "center",
        gap: spacing.md,
        minWidth: 200,
      }}
    >
      {/* Den nhap nhay theo trang thai */}
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: token.main,
          boxShadow: `0 0 14px ${token.main}`,
          flexShrink: 0,
          animation: "pulse 2s infinite",
        }}
      />
      <div>
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: token.main,
          }}
        >
          {status.label}
        </div>
        <div style={{ fontSize: fontSize.xs, color: colors.muted, marginTop: 2 }}>
          {SCENARIO_LABEL_VI[status.level]}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
});
