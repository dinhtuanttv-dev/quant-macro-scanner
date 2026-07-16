// Golden Filter Engine - chon 20 ma co diem cao nhat tu ket qua
// Pattern Scanner (thay vi rule cu MA50+RS+Confluence).
// HARD_DATA: sap xep thuan theo confidenceScore da tinh o Pattern
// Scanner, khong tinh toan lai.

import type { PatternMatch } from "../detectors/patternScanner";

export interface GoldenFilterStock {
  ticker: string;
  sector: string;
  pattern: string;
  patternLabel: string;
  tag: string;
  confidenceScore: number;
  status: "forming" | "confirmed";
}

/**
 * Chon 20 ma diem cao nhat tu danh sach Pattern Match.
 * Neu 1 ma co nhieu pattern trung nhau, chi giu pattern diem cao nhat
 * (tranh 1 ma xuat hien nhieu lan trong Golden Filter).
 */
export function selectGoldenFilter(matches: PatternMatch[], topN: number = 20): GoldenFilterStock[] {
  const bestPerTicker = new Map<string, PatternMatch>();

  matches.forEach((m) => {
    const existing = bestPerTicker.get(m.ticker);
    if (!existing || m.confidenceScore > existing.confidenceScore) {
      bestPerTicker.set(m.ticker, m);
    }
  });

  return Array.from(bestPerTicker.values())
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, topN)
    .map((m) => ({
      ticker: m.ticker, sector: m.sector, pattern: m.pattern, patternLabel: m.patternLabel,
      tag: m.tag, confidenceScore: m.confidenceScore, status: m.status,
    }));
}