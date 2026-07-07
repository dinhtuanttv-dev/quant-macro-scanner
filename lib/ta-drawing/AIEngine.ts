import type { OhlcvBar } from "./ChartManager";
import type { PriceZone } from "./DrawingManager";

export type ZoneClassification = "Kháng cự" | "Hỗ trợ" | "Trung tính (giá đang ở trong vùng)";

export interface ZoneAnalysisResult {
  zoneId: string; classification: ZoneClassification; touches: number;
  avgVolumeInZone: number | null; avgVolumeOverall: number; volumeRatio: number | null;
  distancePct: number; widthPct: number; confidenceScore: number;
  dataQuality: "HARD_DATA"; analyzedAt: number; summary: string;
}

export class AIEngine {
  analyzeZone(zone: PriceZone, bars: OhlcvBar[], currentPrice: number): ZoneAnalysisResult {
    let touches = 0;
    const volumesInZone: number[] = [];
    bars.forEach((bar) => {
      if (bar.high >= zone.bottomPrice && bar.low <= zone.topPrice) {
        touches++; volumesInZone.push(bar.volume);
      }
    });
    const avgVolumeInZone = volumesInZone.length > 0 ? volumesInZone.reduce((a, b) => a + b, 0) / volumesInZone.length : null;
    const avgVolumeOverall = bars.length > 0 ? bars.reduce((s, b) => s + b.volume, 0) / bars.length : 0;
    const volumeRatio = avgVolumeInZone !== null && avgVolumeOverall > 0 ? Math.round((avgVolumeInZone / avgVolumeOverall) * 100) / 100 : null;

    let classification: ZoneClassification;
    let distancePct: number;
    if (currentPrice > zone.topPrice) { classification = "Hỗ trợ"; distancePct = ((currentPrice - zone.topPrice) / currentPrice) * 100; }
    else if (currentPrice < zone.bottomPrice) { classification = "Kháng cự"; distancePct = ((zone.bottomPrice - currentPrice) / currentPrice) * 100; }
    else { classification = "Trung tính (giá đang ở trong vùng)"; distancePct = 0; }
    distancePct = Math.round(distancePct * 100) / 100;

    const zoneMidPrice = (zone.topPrice + zone.bottomPrice) / 2;
    const widthPct = Math.round(((zone.topPrice - zone.bottomPrice) / zoneMidPrice) * 10000) / 100;

    let confidence = 0;
    confidence += Math.min(40, touches * 8);
    if (volumeRatio !== null) confidence += Math.min(30, Math.max(0, (volumeRatio - 1) * 30));
    if (widthPct < 2) confidence += 20; else if (widthPct < 5) confidence += 10;
    if (distancePct < 3) confidence += 10;
    confidence = Math.min(100, Math.round(confidence));

    const summary = this.buildSummary(classification, touches, volumeRatio, distancePct, widthPct, confidence);

    return {
      zoneId: zone.id, classification, touches,
      avgVolumeInZone: avgVolumeInZone !== null ? Math.round(avgVolumeInZone) : null,
      avgVolumeOverall: Math.round(avgVolumeOverall), volumeRatio, distancePct, widthPct,
      confidenceScore: confidence, dataQuality: "HARD_DATA", analyzedAt: Date.now(), summary,
    };
  }

  private buildSummary(c: ZoneClassification, touches: number, volRatio: number | null, distPct: number, widthPct: number, conf: number): string {
    const parts: string[] = [];
    parts.push(`${c}, đã chạm ${touches} lần trong dữ liệu hiển thị.`);
    if (volRatio !== null) {
      if (volRatio > 1.3) parts.push(`Volume tại vùng cao hơn ${volRatio}x trung bình — vùng có ý nghĩa.`);
      else if (volRatio < 0.7) parts.push(`Volume tại vùng thấp (${volRatio}x TB) — độ tin cậy giảm.`);
    }
    if (distPct > 0) parts.push(`Cách giá hiện tại ${distPct}%.`);
    if (widthPct > 5) parts.push(`Vùng khá rộng (${widthPct}%) — cân nhắc thu hẹp.`);
    parts.push(`Điểm tin cậy: ${conf}/100 (HARD_DATA).`);
    return parts.join(" ");
  }
}