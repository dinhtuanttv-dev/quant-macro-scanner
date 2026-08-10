// hooks/useMarketStatus.ts
// Hook tinh toan thuan (khong goi network) - tinh trang thai thi truong tu
// Fear&Greed proxy + breadth + MA50 VN-Index. Bọc useMemo de tranh tinh lai
// khi page.tsx re-render vi ly do khong lien quan.

"use client";

import { useMemo } from "react";
import type { FearGreedResult, MarketStatusResult, Scenario } from "@/lib/types/siu-quet-ai";

const LEVEL_LABEL: Record<Scenario, string> = {
  growth: "TĂNG TRƯỞNG",
  cautious: "THẬN TRỌNG",
  defensive: "PHÒNG THỦ",
};

export function useMarketStatus(
  fearGreed: FearGreedResult,
  vnIndexMa50Status: "safe" | "warning" | "broken"
): MarketStatusResult {
  return useMemo(() => {
    let level: Scenario;

    if (fearGreed.score >= 60 && vnIndexMa50Status === "safe") {
      level = "growth";
    } else if (fearGreed.score <= 30 || vnIndexMa50Status === "broken") {
      level = "defensive";
    } else {
      level = "cautious";
    }

    return { level, label: LEVEL_LABEL[level] };
  }, [fearGreed.score, vnIndexMa50Status]);
}
