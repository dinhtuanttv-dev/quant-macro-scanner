// lib/design-tokens.ts
export const colors = {
  bg: "#070b14", card: "#0e1626", card2: "#0a1020",
  border: "rgba(148,163,184,0.12)", borderStrong: "rgba(148,163,184,0.2)",
  text: "#f1f5f9", muted: "#94a3b8", mutedDark: "#64748b",
  amber: "#f59e0b", amberLight: "#fbbf24",
  emerald: "#10b981", emeraldLight: "#34d399",
  red: "#ef4444", sky: "#38bdf8", violet: "#a78bfa", yellow: "#eab308",
} as const;
export const radius = { sm: "8px", md: "10px", lg: "14px", xl: "16px" } as const;
export const spacing = { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "20px" } as const;
export const fontSize = { xs: "9px", sm: "11px", md: "13px", lg: "15px", xl: "20px", "2xl": "34px" } as const;
export const cardGradient = `linear-gradient(165deg, ${colors.card} 0%, ${colors.card2} 100%)`;
export const scenarioColors = {
  growth: { main: "#34d399", bg: "rgba(16,185,129,0.22)", bgSoft: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.4)" },
  cautious: { main: "#eab308", bg: "rgba(234,179,8,0.22)", bgSoft: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.4)" },
  defensive: { main: "#ef4444", bg: "rgba(239,68,68,0.22)", bgSoft: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.4)" },
} as const;
