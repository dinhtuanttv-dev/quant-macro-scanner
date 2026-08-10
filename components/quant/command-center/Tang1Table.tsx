// components/quant/command-center/Tang1Table.tsx
// Organism: Bang Top 20 co phieu theo kich ban hien tai.
// Chi nhan props, render Tang1TableRow x N. Khong co logic tinh toan ben trong.

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";
import { Tang1TableRow } from "./Tang1TableRow";
import type { Tang1RowData } from "./Tang1TableRow";
import type { MacroEventSummary, PinMap, TickerImpactResult } from "@/lib/types/siu-quet-ai";

interface Props {
  rows: Tang1RowData[];
  impactMap: Record<string, TickerImpactResult>;
  pins: PinMap;
  availableEvents: MacroEventSummary[];
  onPin: (ticker: string, eventId: string) => void;
  onUnpin: (ticker: string) => void;
}

const TH_STYLE: React.CSSProperties = {
  position: "sticky", top: 0,
  background: "#0e1626",
  textAlign: "left",
  padding: `${spacing.sm} ${spacing.sm}`,
  fontSize: fontSize.xs, textTransform: "uppercase",
  color: colors.muted, borderBottom: `1px solid ${colors.border}`,
  fontWeight: 700, letterSpacing: "0.04em", zIndex: 1,
  whiteSpace: "nowrap",
};

export function Tang1Table({ rows, impactMap, pins, availableEvents, onPin, onUnpin }: Props) {
  return (
    <div
      style={{
        background: cardGradient, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, padding: spacing.lg,
      }}
    >
      <div style={{ fontSize: fontSize.xs, fontWeight: 800, textTransform: "uppercase",
        letterSpacing: "0.03em", color: colors.amberLight, marginBottom: spacing.md }}>
        🎯 Tang 1 — Sieu Quet AI: Top 20 co phieu theo kich ban hien tai
      </div>

      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fontSize.sm }}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Ma</th>
              <th style={TH_STYLE}>Smart Scoring</th>
              <th style={TH_STYLE}>Trend Tag</th>
              <th style={TH_STYLE}>Quality Tag</th>
              <th style={TH_STYLE}>Event Impact</th>
              <th style={{ ...TH_STYLE, textAlign: "right" }}>Gia &amp; Bien dong</th>
              <th style={TH_STYLE}>Ghim</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: spacing.xl, textAlign: "center",
                  color: colors.muted, fontSize: fontSize.sm }}>
                  Chua co du lieu — chay lan quet dau tien qua /api/catalysts/scan
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <Tang1TableRow
                  key={row.ticker}
                  {...row}
                  impact={impactMap[row.ticker]?.direction ?? "none"}
                  pinnedEventId={pins[row.ticker] ?? null}
                  availableEvents={availableEvents}
                  onPin={onPin}
                  onUnpin={onUnpin}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
