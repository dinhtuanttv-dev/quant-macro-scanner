// AIEngine (Command Center) - phân tích vùng người vẽ, đối chiếu
// (cross-reference) với SMC/VSA/Pattern Scanner đã tự động phát
// hiện. HARD_DATA thuần, không gọi API ngoài.

import type { DrawnPrimitive, RectangleZone, Trendline } from "./DrawingManager";
import type { OrderBlock, FairValueGap, BreakOfStructure } from "./detectors/smcDetector";
import type { VSASignal } from "./detectors/vsaDetector";
import type { PatternMatch } from "./detectors/patternScanner";

export interface SignalLogEntry {
  id: string; message: string; confidence: number | null;
  source: "user" | "ai"; dataQuality: "HARD_DATA" | "ESTIMATED"; createdAt: number;
}

export interface ActiveLayers {
  smc: boolean; vsa: boolean; wyckoff: boolean; elliott: boolean;
}

function overlaps(aTop: number, aBottom: number, bTop: number, bBottom: number): boolean {
  return aTop >= bBottom && bTop >= aBottom;
}

export class AIEngine {
  private idCounter = 0;

  analyzeAndCrossReference(
    primitive: DrawnPrimitive,
    smc: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] },
    vsa: VSASignal[],
    currentPrice: number
  ): SignalLogEntry[] {
    const entries: SignalLogEntry[] = [];

    if (primitive.toolType === "rectangle") {
      const zone = primitive as RectangleZone;
      const top = Math.max(zone.p1.price, zone.p2.price);
      const bottom = Math.min(zone.p1.price, zone.p2.price);
      const classification = currentPrice > top ? "Hỗ trợ" : currentPrice < bottom ? "Kháng cự" : "Trung tính";

      const matchedOB = smc.obs.find((ob) => overlaps(top, bottom, ob.top, ob.bottom));
      const matchedVSA = vsa.find((v) => v.date >= zone.p1.date && v.date <= zone.p2.date);

      let confidence = 40;
      const reasons: string[] = [];
      if (matchedOB) { confidence += 30; reasons.push(`trùng Order Block ${matchedOB.type}`); }
      if (matchedVSA) { confidence += 20; reasons.push(`VSA xác nhận (${matchedVSA.type})`); }
      confidence = Math.min(99, confidence);

      const message = reasons.length > 0
        ? `Demand/Supply Zone (User) → AI xác nhận (${confidence}%) — ${reasons.join(", ")}.`
        : `Vùng ${classification} (User) — chưa có xác nhận chéo từ SMC/VSA (${confidence}%).`;

      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now() });
    }

    if (primitive.toolType === "trendline") {
      const line = primitive as Trendline;
      const matchedBOS = smc.bos.find((b) => b.date >= line.p1.date && b.date <= line.p2.date);
      const message = matchedBOS
        ? `Trendline Breakout (AI phát hiện BOS ${matchedBOS.type}) → xác thực chéo bởi đường xu hướng người vẽ.`
        : `Trendline (User) đã vẽ — chưa phát hiện BOS trùng khớp trong khoảng thời gian này.`;
      entries.push({ id: `log-${++this.idCounter}-${Date.now()}`, message, confidence: matchedBOS ? 85 : null, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now() });
    }

    if (primitive.toolType === "fibonacci") {
      entries.push({
        id: `log-${++this.idCounter}-${Date.now()}`,
        message: `Fibonacci Retracement (User) đã vẽ — 7 mức giá đã tính (0% đến 100%).`,
        confidence: null, source: "user", dataQuality: "HARD_DATA", createdAt: Date.now(),
      });
    }

    return entries;
  }

  /**
   * AI Confluence: doi chieu 1 pattern (tu Pattern Scanner) voi cac
   * layer dang bat (SMC/VSA) de tinh diem dong thuan tong hop.
   */
  analyzePatternConfluence(
    pattern: PatternMatch,
    smc: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] },
    vsa: VSASignal[],
    activeLayers: ActiveLayers
  ): SignalLogEntry {
    const reasons: string[] = [];
    let confidence = pattern.confidenceScore;

    if (activeLayers.smc) {
      const matchedOB = smc.obs.find((ob) => ob.date >= pattern.dateRangeStart && ob.date <= pattern.dateRangeEnd);
      if (matchedOB) { confidence = Math.min(99, confidence + 10); reasons.push(`SMC OB ${matchedOB.type} trùng khớp`); }
    }
    if (activeLayers.vsa) {
      const matchedVSA = vsa.find((v) => v.date >= pattern.dateRangeStart && v.date <= pattern.dateRangeEnd);
      if (matchedVSA) { confidence = Math.min(99, confidence + 8); reasons.push(`VSA ${matchedVSA.type} xác nhận`); }
    }

    const message = reasons.length > 0
      ? `User: ${pattern.patternLabel} phát hiện (${pattern.ticker}) → AI: Confluence xác nhận với ${reasons.join(", ")} (${confidence}%).`
      : `Pattern Scanner: ${pattern.patternLabel} (${pattern.ticker}) — chưa có xác nhận chéo từ layer đang bật (${confidence}%).`;

    return {
      id: `log-conf-${++this.idCounter}-${Date.now()}`, message, confidence,
      source: "ai", dataQuality: "HARD_DATA", createdAt: Date.now(),
    };
  }
}