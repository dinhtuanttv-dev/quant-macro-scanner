// components/quant/command-center/CommandCenterBar.tsx
// Organism: Thanh chi huy tren cung, ghep 3 atom lai.
// Chi nhan props, khong co logic tinh toan ben trong.

"use client";

import React from "react";
import { spacing } from "@/lib/design-tokens";
import { MarketStatusIndicator } from "./MarketStatusIndicator";
import { UniversalCountdown } from "./UniversalCountdown";
import { ScenarioSwitcher } from "./ScenarioSwitcher";
import type { MarketStatusResult, MacroEventSummary, Scenario } from "@/lib/types/siu-quet-ai";

interface Props {
  status: MarketStatusResult;
  nearestEvent: MacroEventSummary | null;
  scenario: Scenario;
  onScenarioChange: (s: Scenario) => void;
}

export function CommandCenterBar({ status, nearestEvent, scenario, onScenarioChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: spacing.md,
        marginBottom: spacing.lg,
        flexWrap: "wrap",
      }}
    >
      <MarketStatusIndicator status={status} />
      <UniversalCountdown event={nearestEvent} />
      <ScenarioSwitcher value={scenario} onChange={onScenarioChange} />
    </div>
  );
}
