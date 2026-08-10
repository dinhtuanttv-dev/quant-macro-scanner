// components/quant/command-center/MarketOverviewBullets.tsx
// Atom: 3 dong phan tich ngan (Vi mo / Dong tien / Ky thuat).
// Noi dung tinh tu props, khong goi network.

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize } from "@/lib/design-tokens";

interface Bullet {
  icon: string;
  label: string;
  value: string;
}

interface Props {
  bullets: Bullet[];
}

const DEFAULT_BULLETS: Bullet[] = [
  { icon: "✗", label: "Vi mo", value: "Tac dong hon hop, cho tin hieu chinh sach." },
  { icon: "↕", label: "Dong tien", value: "Phan hoa, dich chuyen sang von hoa lon." },
  { icon: "📊", label: "Ky thuat", value: "VN-Index test lai ho tro MA50." },
];

export const MarketOverviewBullets = React.memo(function MarketOverviewBullets({
  bullets = DEFAULT_BULLETS,
}: Props) {
  return (
    <div
      style={{
        background: cardGradient,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        padding: spacing.lg,
        marginBottom: spacing.lg,
      }}
    >
      <div
        style={{
          fontSize: fontSize.xs, fontWeight: 800, textTransform: "uppercase",
          letterSpacing: "0.03em", color: colors.amberLight, marginBottom: spacing.md,
        }}
      >
        📊 Phan tich tong quan thi truong
      </div>
      {bullets.map((b, i) => (
        <div
          key={i}
          style={{
            display: "flex", gap: spacing.sm, fontSize: fontSize.sm,
            marginBottom: i < bullets.length - 1 ? spacing.sm : 0,
            lineHeight: 1.5, color: colors.text,
          }}
        >
          <span style={{ color: colors.muted, flexShrink: 0, width: 16 }}>{b.icon}</span>
          <span>
            <b style={{ color: colors.text }}>{b.label}:</b>{" "}
            <span style={{ color: "#cbd5e1" }}>{b.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
});
