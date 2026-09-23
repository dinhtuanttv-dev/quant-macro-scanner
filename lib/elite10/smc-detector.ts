// Elite 10 - SMC Detector (Giai doan 1): Fair Value Gap (FVG) + Break of
// Structure/Change of Character (BOS/CHoCH). MODULE HOAN TOAN MOI, KHONG
// SUA bat ky file nao dang hoat dong dung (Time Engine, Confluence
// Engine, Data Quality Gate, MainChart core...).
//
// DINH NGHIA TOAN HOC (da xac nhan qua nhieu nguon tai lieu SMC/ICT
// dong nhat, khong tu bia):
//   - Swing High/Low: fractal N-bar (mac dinh N=2, kieu Bill Williams
//     Fractal 5-nen) - 1 nen la Swing High neu High cua no LON HON
//     High cua N nen truoc VA N nen sau.
//   - FVG (Fair Value Gap): mau hinh 3 nen lien tiep (i-2, i-1, i).
//     Bullish FVG: Low[i] > High[i-2] (khoang trong giua day nen hien
//     tai va dinh nen 2 phien truoc). Bearish FVG: High[i] < Low[i-2].
//   - BOS (Break of Structure, tiep dien xu huong): trong uptrend, gia
//     dong cua PHA VO Swing High gan nhat. Trong downtrend, gia PHA VO
//     Swing Low gan nhat.
//   - CHoCH (Change of Character, dao chieu som): trong uptrend, gia
//     PHA VO Swing Low gan nhat (mat Higher Low). Trong downtrend,
//     nguoc lai.
//
// GIAI DOAN 2 (them, KHONG sua Giai doan 1): Order Block + VSA.
//   - Order Block: nen DOI NGHICH CUOI CUNG truoc 1 BOS event, VOI DIEU
//     KIEN co it nhat 1 nen giua OB va BOS co |range| >= 1.5xATR14
//     ("impulsive move" - nguong dinh luong, khong co 1 so "chuan" duy
//     nhat trong tai lieu SMC, 1.5x la lua chon pho bien va da thong
//     nhat voi nguoi dung).
//   - VSA No Demand/No Supply: nen tang/giam voi volume THAP (duoi
//     percentile 40 cua N=20 phien gan nhat) VA spread hep (duoi trung
//     binh N=20 phien) - dinh nghia VSA chuan (Tom Williams).
import { calculateAtrSeries } from "@/lib/market-data/technical-indicators";

export interface OhlcBarInput { date: string; open: number; high: number; low: number; close: number; volume?: number; }

export interface SwingPoint { index: number; date: string; price: number; type: "high" | "low"; }

export interface FvgZone {
  startDate: string; endDate: string;
  direction: "bullish" | "bearish";
  top: number; bottom: number;
  isMitigated: boolean; mitigatedDate: string | null;
}

export type StructureEventType = "BOS" | "CHoCH";
export interface StructureEvent {
  date: string; type: StructureEventType; direction: "bullish" | "bearish";
  brokenSwingPrice: number; brokenSwingDate: string;
}

/** Fractal N-bar swing detection - N=2 mac dinh (Bill Williams 5-nen). */
export function detectSwingPoints(bars: OhlcBarInput[], n = 2): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = n; i < bars.length - n; i++) {
    const isHigh = Array.from({ length: n }, (_, k) => k + 1).every(
      (k) => bars[i].high > bars[i - k].high && bars[i].high > bars[i + k].high
    );
    if (isHigh) swings.push({ index: i, date: bars[i].date, price: bars[i].high, type: "high" });

    const isLow = Array.from({ length: n }, (_, k) => k + 1).every(
      (k) => bars[i].low < bars[i - k].low && bars[i].low < bars[i + k].low
    );
    if (isLow) swings.push({ index: i, date: bars[i].date, price: bars[i].low, type: "low" });
  }
  return swings.sort((a, b) => a.index - b.index);
}

/** FVG: quet toan bo lich su, gan nhan mitigated neu gia SAU DO quay lai lap day gap. */
export function detectFvgZones(bars: OhlcBarInput[]): FvgZone[] {
  const zones: FvgZone[] = [];
  for (let i = 2; i < bars.length; i++) {
    const barA = bars[i - 2], barC = bars[i];
    if (barC.low > barA.high) {
      zones.push({ startDate: barA.date, endDate: barC.date, direction: "bullish", top: barC.low, bottom: barA.high, isMitigated: false, mitigatedDate: null });
    } else if (barC.high < barA.low) {
      zones.push({ startDate: barA.date, endDate: barC.date, direction: "bearish", top: barA.low, bottom: barC.high, isMitigated: false, mitigatedDate: null });
    }
  }
  // Kiem tra mitigation: gia CAC PHIEN SAU co quay lai cham vung gap khong
  for (const zone of zones) {
    const zoneEndIdx = bars.findIndex((b) => b.date === zone.endDate);
    for (let j = zoneEndIdx + 1; j < bars.length; j++) {
      const touchesZone = bars[j].low <= zone.top && bars[j].high >= zone.bottom;
      if (touchesZone) { zone.isMitigated = true; zone.mitigatedDate = bars[j].date; break; }
    }
  }
  return zones;
}

/** BOS/CHoCH: xac dinh dua tren chuoi Swing Points + huong trend hien
 * tai (Higher High+Higher Low = uptrend; Lower High+Lower Low =
 * downtrend). Gia PHA VO swing gan nhat theo dung/nguoc huong trend. */
export function detectStructureEvents(bars: OhlcBarInput[], swings: SwingPoint[]): StructureEvent[] {
  const events: StructureEvent[] = [];
  let currentTrend: "up" | "down" | "unknown" = "unknown";
  let lastSwingHigh: SwingPoint | null = null;
  let lastSwingLow: SwingPoint | null = null;
  let brokenHighs = new Set<number>();
  let brokenLows = new Set<number>();

  const swingsByIndex = [...swings].sort((a, b) => a.index - b.index);

  for (let i = 0; i < bars.length; i++) {
    // Cap nhat swing gan nhat da biet tinh den phien nay
    for (const s of swingsByIndex) {
      if (s.index === i) {
        if (s.type === "high") lastSwingHigh = s;
        else lastSwingLow = s;
      }
    }

    if (lastSwingHigh && !brokenHighs.has(lastSwingHigh.index) && bars[i].close > lastSwingHigh.price && i > lastSwingHigh.index) {
      const type: StructureEventType = currentTrend === "down" ? "CHoCH" : "BOS";
      events.push({ date: bars[i].date, type, direction: "bullish", brokenSwingPrice: lastSwingHigh.price, brokenSwingDate: lastSwingHigh.date });
      brokenHighs.add(lastSwingHigh.index);
      currentTrend = "up";
    }
    if (lastSwingLow && !brokenLows.has(lastSwingLow.index) && bars[i].close < lastSwingLow.price && i > lastSwingLow.index) {
      const type: StructureEventType = currentTrend === "up" ? "CHoCH" : "BOS";
      events.push({ date: bars[i].date, type, direction: "bearish", brokenSwingPrice: lastSwingLow.price, brokenSwingDate: lastSwingLow.date });
      brokenLows.add(lastSwingLow.index);
      currentTrend = "down";
    }
  }
  return events;
}

export interface OrderBlockZone {
  date: string; direction: "bullish" | "bearish";
  top: number; bottom: number;
  linkedEventDate: string; impulseRatio: number; // ty le range nen impulse / ATR14 tai thoi diem do
}

/** Order Block: nen DOI NGHICH CUOI CUNG truoc 1 BOS/CHoCH event, VOI
 * DIEU KIEN co it nhat 1 nen "impulsive" (range >= 1.5xATR14) giua no
 * va event. Nguong 1.5x da thong nhat voi nguoi dung - co the dieu
 * chinh qua tham so impulseThreshold. */
export function detectOrderBlocks(bars: OhlcBarInput[], events: StructureEvent[], impulseThreshold = 1.5): OrderBlockZone[] {
  const atrSeries = calculateAtrSeries(bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 })));
  const dateToIndex = new Map(bars.map((b, i) => [b.date, i]));
  const zones: OrderBlockZone[] = [];

  for (const ev of events) {
    const eventIdx = dateToIndex.get(ev.date);
    if (eventIdx === undefined || eventIdx < 1) continue;

    // Tim nen doi nghich gan nhat LUI VE TU truoc event (toi da 10 nen
    // lui lai - qua xa thi khong con lien quan truc tiep den cau truc).
    let obIndex = -1;
    for (let i = eventIdx - 1; i >= Math.max(0, eventIdx - 10); i--) {
      const isOpposite = ev.direction === "bullish" ? bars[i].close < bars[i].open : bars[i].close > bars[i].open;
      if (isOpposite) { obIndex = i; break; }
    }
    if (obIndex === -1) continue;

    // Kiem tra co it nhat 1 nen "impulsive" giua OB va event
    let maxImpulseRatio = 0;
    for (let i = obIndex + 1; i <= eventIdx; i++) {
      const range = bars[i].high - bars[i].low;
      const atr = atrSeries[i] || 1e-9;
      maxImpulseRatio = Math.max(maxImpulseRatio, range / atr);
    }
    if (maxImpulseRatio < impulseThreshold) continue; // khong du manh -> khong tinh la Order Block

    zones.push({
      date: bars[obIndex].date, direction: ev.direction,
      top: Math.max(bars[obIndex].open, bars[obIndex].close), bottom: Math.min(bars[obIndex].open, bars[obIndex].close),
      linkedEventDate: ev.date, impulseRatio: Math.round(maxImpulseRatio * 100) / 100,
    });
  }
  return zones;
}

export interface VsaSignal { date: string; type: "no_demand" | "no_supply"; volume: number; volumePercentile: number; }

/** VSA No Demand/No Supply (dinh nghia chuan Tom Williams): nen tang/
 * giam voi volume THAP (duoi percentile 40 cua N=20 phien gan nhat) VA
 * spread (range) hep hon trung binh N=20 phien - bao hieu THIEU luc
 * mua/ban tuong ung. */
export function detectVsaSignals(bars: OhlcBarInput[], lookback = 20, volumePercentileThreshold = 40): VsaSignal[] {
  const signals: VsaSignal[] = [];
  for (let i = lookback; i < bars.length; i++) {
    const window = bars.slice(i - lookback, i);
    const volumes = window.map((b) => b.volume ?? 0).sort((a, b) => a - b);
    const spreads = window.map((b) => b.high - b.low);
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;

    const bar = bars[i];
    const barVolume = bar.volume ?? 0;
    const barSpread = bar.high - bar.low;
    const percentileRank = volumes.filter((v) => v <= barVolume).length / volumes.length * 100;

    const isLowVolume = percentileRank <= volumePercentileThreshold;
    const isNarrowSpread = barSpread < avgSpread;
    if (!isLowVolume || !isNarrowSpread) continue;

    if (bar.close > bar.open) {
      signals.push({ date: bar.date, type: "no_demand", volume: barVolume, volumePercentile: Math.round(percentileRank) });
    } else if (bar.close < bar.open) {
      signals.push({ date: bar.date, type: "no_supply", volume: barVolume, volumePercentile: Math.round(percentileRank) });
    }
  }
  return signals;
}
