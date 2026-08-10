// components/quant/command-center/ScenarioSwitcher.tsx
// Atom: 3 nut chuyen kich ban xep doc, mau lay tu scenarioColors.

"use client";

import React from "react";
import { scenarioColors, colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import type { Scenario } from "@/lib/types/siu-quet-ai";

const BUTTONS: { value: Scenario; label: string }[] = [
  { value: "growth", label: "TANG TRUONG" },
  { value: "cautious", label: "THAN TRONG" },
  { value: "defensive", label: "PHONG THU" },
];

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

export const ScenarioSwitcher = React.memo(function ScenarioSwitcher({ value, onChange }: Props) {
  return (
    <div
      style={{
        background: cardGradient,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        padding: spacing.sm,
        display: "flex",
        flexDirection: "column",
        gap: spacing.xs,
        minWidth: 170,
      }}
    >
      <div
        style={{
          fontSize: fontSize.xs,
          color: colors.muted,
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: spacing.xs,
        }}
      >
        Che do kich ban nhanh
      </div>
      {BUTTONS.map((btn) => {
        const isActive = value === btn.value;
        const token = scenarioColors[btn.value];
        return (
          <button
            key={btn.value}
            onClick={() => onChange(btn.value)}
            style={{
              padding: `${spacing.sm} ${spacing.md}`,
              borderRadius: radius.md,
              fontSize: fontSize.sm,
              fontWeight: 800,
              textAlign: "center",
              cursor: "pointer",
              border: `1px solid ${isActive ? token.border : colors.border}`,
              background: isActive ? `linear-gradient(135deg, ${token.bg}, ${token.bgSoft})` : "transparent",
              color: isActive ? token.main : colors.muted,
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
});
