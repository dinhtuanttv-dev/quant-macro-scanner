// components/quant/command-center/TradingPlanCard.tsx
// Molecule: Ke hoach giao dich tuc thoi theo kich ban hien tai.
// Noi dung thay doi theo scenario - khong goi AI, dung template tinh toan san
// (ghe po ket qua computeTang1WithScenario + phan tich vi mo co san).

"use client";

import React from "react";
import { colors, cardGradient, radius, spacing, fontSize, scenarioColors } from "@/lib/design-tokens";
import type { Scenario } from "@/lib/types/siu-quet-ai";

const PLAN_CONTENT: Record<Scenario, { bullets: string[]; action: string }> = {
  growth: {
    bullets: [
      "Vi mo: Dong luc tang truong ro rang, thi truong on dinh tren MA50.",
      "Dong tien: Kho ngoai mua rong, nhom von hoa lon dan dau.",
      "Ky thuat: Bollinger Band mo rong, RS3m nhieu ma duong tinh.",
    ],
    action:
      "Tang ty trong co phieu tang truong manh (RS3m > +10%). Duy tri margin o muc trung binh (30-40%). Chot loi dan khi gia vuot vung khang cu.",
  },
  cautious: {
    bullets: [
      "Vi mo: Tac dong hon hop - cho tin tuc chinh sach Fed/SBV, chua ro xu huong.",
      "Dong tien: Phan hoa, dich chuyen sang nhom von hoa lon va co tuc cao.",
      "Ky thuat: VN-Index dang test lai ho tro MA50, chua xac nhan breakout.",
    ],
    action:
      "Uu tien co phieu on dinh (MA50 safe, bien dong thap). Giam margin xuong 15-20%. Tang ti le tien mat du phong. Tranh duoi da tang.",
  },
  defensive: {
    bullets: [
      "Vi mo: Rui ro vi mo tang cao, thi truong co the dieu chinh manh.",
      "Dong tien: Dong tien rut rong khoi co phieu rui ro cao.",
      "Ky thuat: VN-Index vi pham MA50, tín hieu ky thuat xau.",
    ],
    action:
      "Giam ty trong co phieu xuong muc toi thieu. Tang ti le tien mat > 40%. Chi giu nhung ma co nen tang vung (no thap, dong tien duong, co tuc on dinh).",
  },
};

interface Props {
  scenario: Scenario;
}

export const TradingPlanCard = React.memo(function TradingPlanCard({ scenario }: Props) {
  const token = scenarioColors[scenario];
  const content = PLAN_CONTENT[scenario];

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
        🧭 Ke hoach giao dich tuc thoi
      </div>

      {/* 3 bullets phan tich */}
      <div style={{ marginBottom: spacing.md }}>
        {content.bullets.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: spacing.sm, fontSize: fontSize.sm,
            marginBottom: spacing.sm, lineHeight: 1.5, color: colors.text }}>
            <span style={{ color: colors.muted, flexShrink: 0 }}>
              {i === 0 ? "✗" : i === 1 ? "↕" : "📊"}
            </span>
            <span dangerouslySetInnerHTML={{ __html: b }} />
          </div>
        ))}
      </div>

      {/* Khung hanh dong */}
      <div
        style={{
          background: `linear-gradient(135deg, ${token.bg}, ${token.bgSoft})`,
          border: `1px solid ${token.border}`,
          borderLeft: `3px solid ${token.main}`,
          borderRadius: `0 ${radius.md} ${radius.md} 0`,
          padding: `${spacing.sm} ${spacing.md}`,
          fontSize: fontSize.sm,
          color: colors.text,
          lineHeight: 1.6,
        }}
      >
        <span style={{ fontWeight: 700, color: token.main }}>Ke hoach: </span>
        {content.action}
      </div>
    </div>
  );
});
