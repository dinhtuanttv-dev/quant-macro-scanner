// components/catalyst/TrustScoreBadge.tsx — PHASE 3, giải quyết M4
// UI hien thi truong "trustScore" da duoc CatalystEngine tinh san tu Phase 1
// (computeTrustScore) nhung chua co noi nao hien thi tren giao dien. Component
// nay nhan truc tiep score (0-100) da tinh, KHONG tinh toan lai o phia client.

"use client";

import React from "react";

interface Props {
  score: number; // 0-100, lấy từ TickerImpactCard.trustScore
  label: string; // "Rất đáng tin" | "Đáng tin" | ... — từ trustScoreLabel()
  size?: "sm" | "md";
}

function scoreToColor(score: number): { main: string; bg: string } {
  if (score >= 80) return { main: "#34d399", bg: "rgba(16,185,129,0.15)" };
  if (score >= 60) return { main: "#38bdf8", bg: "rgba(56,189,248,0.15)" };
  if (score >= 40) return { main: "#eab308", bg: "rgba(234,179,8,0.15)" };
  return { main: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
}

export const TrustScoreBadge = React.memo(function TrustScoreBadge({ score, label, size = "sm" }: Props) {
  const { main, bg } = scoreToColor(score);
  const dim = size === "sm" ? 28 : 36;
  const fontSize = size === "sm" ? 10 : 12;
  const circumference = 2 * Math.PI * (dim / 2 - 3);
  const filledLength = (score / 100) * circumference;

  return (
    <div
      title={`${label} — ${score}/100`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {/* Vòng tròn tiến độ SVG, không phụ thuộc thư viện biểu đồ ngoài */}
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        <circle
          cx={dim / 2} cy={dim / 2} r={dim / 2 - 3}
          fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth={3}
        />
        <circle
          cx={dim / 2} cy={dim / 2} r={dim / 2 - 3}
          fill="none" stroke={main} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
        <text
          x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fontSize={fontSize} fontWeight={800} fill={main}
        >
          {score}
        </text>
      </svg>

      <span
        style={{
          fontSize: 10, fontWeight: 700, color: main,
          background: bg, padding: "2px 7px", borderRadius: 999,
        }}
      >
        {label}
      </span>
    </div>
  );
});
