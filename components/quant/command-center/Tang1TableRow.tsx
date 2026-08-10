// components/quant/command-center/Tang1TableRow.tsx
// Atom: 1 dong trong bang Top 20. Boc React.memo va chi nhan props nguyen thuy
// (ticker, score, trend, quality, impact, price, change, pinnedEventId) - KHONG nhan
// mang lon (stocks[]) de tranh re-render toan bang khi 1 dong thay doi trang thai ghim.

"use client";

import React from "react";
import { colors, fontSize, spacing } from "@/lib/design-tokens";
import { PinButton } from "./PinButton";
import type { MacroEventSummary } from "@/lib/types/siu-quet-ai";

type TrendTag = "uptrend" | "accum";
type QualityTag = "stable" | "margin";
type ImpactDir = "benefit" | "harm" | "none";

const TREND_LABEL: Record<TrendTag, string> = {
  uptrend: "Up-Trend",
  accum: "Accumulation",
};
const TREND_BG: Record<TrendTag, string> = {
  uptrend: "rgba(16,185,129,0.15)",
  accum: "rgba(56,189,248,0.15)",
};
const TREND_COLOR: Record<TrendTag, string> = {
  uptrend: colors.emeraldLight,
  accum: colors.sky,
};
const QUALITY_LABEL: Record<QualityTag, string> = {
  stable: "On dinh",
  margin: "Bien LN cao",
};
const QUALITY_BG: Record<QualityTag, string> = {
  stable: "rgba(167,139,250,0.15)",
  margin: "rgba(245,158,11,0.15)",
};
const QUALITY_COLOR: Record<QualityTag, string> = {
  stable: colors.violet,
  margin: colors.amberLight,
};
const IMPACT_LABEL: Record<ImpactDir, string> = {
  benefit: "▲ Huong loi",
  harm: "▼ Rui ro",
  none: "—",
};
const IMPACT_COLOR: Record<ImpactDir, string> = {
  benefit: colors.emeraldLight,
  harm: colors.red,
  none: colors.muted,
};

export interface Tang1RowData {
  ticker: string;
  sector: string;
  scenarioScore: number;
  trend: TrendTag;
  quality: QualityTag;
  impact: ImpactDir;
  price: string;
  change: string;
  changeUp: boolean;
}

interface Props extends Tang1RowData {
  pinnedEventId: string | null;
  availableEvents: MacroEventSummary[];
  onPin: (ticker: string, eventId: string) => void;
  onUnpin: (ticker: string) => void;
}

export const Tang1TableRow = React.memo(function Tang1TableRow(props: Props) {
  const {
    ticker, scenarioScore, trend, quality, impact,
    price, change, changeUp, pinnedEventId, availableEvents, onPin, onUnpin,
  } = props;

  const tdStyle: React.CSSProperties = {
    padding: `${spacing.sm} ${spacing.sm}`,
    borderBottom: `1px solid rgba(148,163,184,0.06)`,
    verticalAlign: "middle",
  };

  return (
    <tr style={{ transition: "background 0.1s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(148,163,184,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>

      {/* Ma */}
      <td style={tdStyle}>
        <span style={{ fontWeight: 800, color: colors.amberLight, fontSize: fontSize.md }}>
          {ticker}
        </span>
      </td>

      {/* Smart Scoring: thanh bar xanh la + so */}
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
          <div style={{ width: 60, height: 5, background: "rgba(148,163,184,0.12)",
            borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${scenarioScore}%`,
              background: `linear-gradient(90deg, ${colors.emerald}, ${colors.emeraldLight})`,
              borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: fontSize.sm, fontVariantNumeric: "tabular-nums",
            color: colors.text }}>{scenarioScore}</span>
        </div>
      </td>

      {/* Trend Tag */}
      <td style={tdStyle}>
        <span style={{
          fontSize: fontSize.xs, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
          background: TREND_BG[trend], color: TREND_COLOR[trend], whiteSpace: "nowrap",
        }}>
          {TREND_LABEL[trend]}
        </span>
      </td>

      {/* Quality Tag */}
      <td style={tdStyle}>
        <span style={{
          fontSize: fontSize.xs, padding: "2px 8px", borderRadius: 999, fontWeight: 700,
          background: QUALITY_BG[quality], color: QUALITY_COLOR[quality], whiteSpace: "nowrap",
        }}>
          {QUALITY_LABEL[quality]}
        </span>
      </td>

      {/* Event Impact */}
      <td style={tdStyle}>
        <span style={{ fontWeight: 700, fontSize: fontSize.sm, color: IMPACT_COLOR[impact] }}>
          {IMPACT_LABEL[impact]}
        </span>
      </td>

      {/* Gia & Bien dong */}
      <td style={{ ...tdStyle, textAlign: "right" }}>
        <div style={{ fontSize: fontSize.sm, fontVariantNumeric: "tabular-nums" }}>{price}</div>
        <div style={{ fontSize: fontSize.xs, color: changeUp ? colors.emeraldLight : colors.red }}>
          {change}
        </div>
      </td>

      {/* Ghim */}
      <td style={tdStyle}>
        <PinButton
          ticker={ticker}
          pinnedEventId={pinnedEventId}
          availableEvents={availableEvents}
          onPin={onPin}
          onUnpin={onUnpin}
        />
      </td>
    </tr>
  );
});
