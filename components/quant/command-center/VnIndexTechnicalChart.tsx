// components/quant/command-center/VnIndexTechnicalChart.tsx
// Atom: Bieu do nen VN-Index mini (sparkline), ve tu du lieu closes da co san
// trong tang4Result / marketData (dung lai useMarketData hook da co san trong project).
// Hien thi vung ho tro / khang cu duoi dang text, khong tinh toan them.

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";

interface Props {
  closes?: number[];        // lich su gia dong cua VN-Index, tang dan theo thoi gian
  supportLevel?: number;
  resistanceLevel?: number;
}

export const VnIndexTechnicalChart = React.memo(function VnIndexTechnicalChart({
  closes = [],
  supportLevel,
  resistanceLevel,
}: Props) {
  const H = 90;
  const W = 280;
  const hasData = closes.length >= 4;

  let polylinePoints = "";
  let colorStroke: string = colors.emeraldLight;

  if (hasData) {
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    polylinePoints = closes.map((v, i) => {
      const x = (i / (closes.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 12) - 6;
      return `${x},${y}`;
    }).join(" ");
    colorStroke = closes[closes.length - 1] >= closes[0] ? colors.emeraldLight : colors.red;
  }

  // Ve cac nen nho (ohlc gia lap tu closes) de giao dien sat voi mockup
  const candleCount = Math.min(closes.length, 16);
  const candleW = W / (candleCount + 1);

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
        ðŸ“ˆ VN-Index Technical Outlook
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none" style={{ display: "block" }}>
        {hasData ? (
          <>
            {/* Sparkline */}
            <polyline
              points={polylinePoints}
              fill="none" stroke={colorStroke}
              strokeWidth={1.8} strokeLinecap="round"
            />
            {/* Nen don gian: moi nen = 1 thanh ngang */}
            {closes.slice(-candleCount).map((v, i) => {
              const prev = closes[closes.length - candleCount + i - 1] ?? v;
              const isUp = v >= prev;
              const min = Math.min(...closes);
              const max = Math.max(...closes);
              const range = max - min || 1;
              const x = (i + 0.5) * candleW;
              const y = H - ((v - min) / range) * (H - 12) - 6;
              return (
                <rect
                  key={i} x={x - 2} y={y - 4} width={4}
                  height={8} rx={1}
                  fill={isUp ? colors.emeraldLight : colors.red}
                  opacity={0.85}
                />
              );
            })}
          </>
        ) : (
          <text x={W / 2} y={H / 2} textAnchor="middle"
            fill={colors.muted} fontSize={11}>
            Chua co du lieu VN-Index
          </text>
        )}
      </svg>

      <div style={{ fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs }}>
        {supportLevel && <span>Ho tro: <b style={{ color: colors.emeraldLight }}>{supportLevel.toLocaleString()}</b></span>}
        {supportLevel && resistanceLevel && <span style={{ margin: "0 8px" }}>â€”</span>}
        {resistanceLevel && <span>Khang cu: <b style={{ color: colors.red }}>{resistanceLevel.toLocaleString()}</b></span>}
        {!supportLevel && !resistanceLevel && "Chua xac dinh vung ho tro / khang cu"}
      </div>
    </div>
  );
});
