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

// ============================================================
// GIAI DOAN 3 (them, KHONG sua Giai doan 1+2): Wyckoff Spring/SOS/LPS.
//
// PHAM VI CO CHU DINH GIOI HAN: day KHONG PHAI phat hien toan bo chu ky
// Wyckoff A-E (PS/SC/AR/ST...) - chinh tai lieu ky thuat chuyen sau nhat
// (vd bai bao MQL5 "Automating Classic Market Methods") cung xac nhan
// "full phase detection requires subjective judgment that is difficult
// to codify reliably". O day CHI phat hien 3 SU KIEN CO DINH NGHIA
// DINH LUONG RO RANG: Spring (gia PHA VO support nhung dong cua QUAY
// LAI tren, volume THAP), SOS/Sign of Strength (breakout resistance voi
// volume+spread MO RONG), LPS/Last Point of Support (pullback sau SOS,
// volume THAP, giu tren muc breakout).
//
// THAM SO (minh bach - CO THE dieu chinh, khong phai "chuan tuyet doi"
// duy nhat trong tai lieu Wyckoff):
//   rangeWindow=30 phien, rangeWidthThreshold=15% (range phai du "hep"),
//   springTolerance=2% (gia pha support bao nhieu % thi tinh la Spring),
//   lowVolMult=0.8x / highVolMult=1.3x trung binh volume trong range,
//   lpsPullbackTolerance=3% (pullback sau SOS duoc phep sau bao nhieu %
//   truoc khi bi coi la vo hieu).

export interface WyckoffRange { startDate: string; endDate: string; support: number; resistance: number; avgVolume: number; avgSpread: number; }
export interface WyckoffEvent { date: string; type: "spring" | "sos" | "lps"; price: number; volume: number; volumeVsAvgPct: number; }
export interface WyckoffSchematic { range: WyckoffRange; spring: WyckoffEvent | null; sos: WyckoffEvent | null; lps: WyckoffEvent | null; status: "range_only" | "spring_confirmed" | "sos_confirmed" | "lps_confirmed"; }

interface WyckoffParams {
  rangeWindow: number; rangeWidthThreshold: number; springTolerance: number;
  lowVolMult: number; highVolMult: number; lpsPullbackTolerance: number;
  maxBarsToSos: number; maxBarsToLps: number;
}
const DEFAULT_WYCKOFF_PARAMS: WyckoffParams = {
  rangeWindow: 30, rangeWidthThreshold: 0.15, springTolerance: 0.02,
  lowVolMult: 0.8, highVolMult: 1.3, lpsPullbackTolerance: 0.03,
  maxBarsToSos: 20, maxBarsToLps: 15,
};

/** Tim schematic Wyckoff GAN NHAT (chi 1 ket qua, uu tien schematic MOI
 * NHAT trong lich su). Tra ve null neu khong tim thay 1 range hop le
 * nao trong toan bo lich su. */
export function detectWyckoffSchematic(bars: OhlcBarInput[], params: Partial<WyckoffParams> = {}): WyckoffSchematic | null {
  const p = { ...DEFAULT_WYCKOFF_PARAMS, ...params };
  let bestSchematic: WyckoffSchematic | null = null;
  // Thu tu uu tien de QUYET DINH co GHI DE bestSchematic hay khong -
  // FIX: truoc day moi vong lap "end" GHI DE vo dieu kien, khien 1 range
  // "range_only" tim thay O VONG LAP SAU xoa mat ket qua "lps_confirmed"
  // tot hon da tim thay o vong lap TRUOC. Gio CHI ghi de khi rank moi >= rank cu.
  const statusRank: Record<WyckoffSchematic["status"], number> = { range_only: 0, spring_confirmed: 1, sos_confirmed: 2, lps_confirmed: 3 };

  for (let end = p.rangeWindow; end < bars.length; end++) {
    const windowBars = bars.slice(end - p.rangeWindow, end);
    const support = Math.min(...windowBars.map((b) => b.low));
    const resistance = Math.max(...windowBars.map((b) => b.high));
    const rangeWidth = (resistance - support) / support;
    if (rangeWidth > p.rangeWidthThreshold) continue; // range qua rong, khong hop le

    const avgVolume = windowBars.reduce((s, b) => s + (b.volume ?? 0), 0) / windowBars.length;
    const avgSpread = windowBars.reduce((s, b) => s + (b.high - b.low), 0) / windowBars.length;
    const range: WyckoffRange = { startDate: windowBars[0].date, endDate: windowBars[windowBars.length - 1].date, support, resistance, avgVolume, avgSpread };

    // Tim Spring: SAU end, gia pha support (trong tolerance) nhung dong
    // cua quay lai tren support, volume thap.
    let springIdx = -1;
    for (let i = end; i < Math.min(bars.length, end + p.maxBarsToSos); i++) {
      const bar = bars[i];
      const brokeSupport = bar.low < support * (1 - p.springTolerance);
      const closedBackAbove = bar.close > support;
      const lowVolume = (bar.volume ?? 0) < avgVolume * p.lowVolMult;
      if (brokeSupport && closedBackAbove && lowVolume) { springIdx = i; break; }
    }
    if (springIdx === -1) {
      // Range hop le nhung CHUA CO Spring - van la thong tin co ich
      // ("dang trong vung tich luy, chua co su kien xac nhan"), KHONG
      // bo qua hoan toan nhu truoc (gay mat thong tin khi thi truong
      // dang trong range nhung chua kip xay ra Spring). CHI ghi de neu
      // chua co ket qua nao TOT HON tu vong lap truoc.
      if (!bestSchematic || statusRank["range_only"] >= statusRank[bestSchematic.status]) {
        bestSchematic = { range, spring: null, sos: null, lps: null, status: "range_only" };
      }
      continue;
    }

    const springBar = bars[springIdx];
    const spring: WyckoffEvent = { date: springBar.date, type: "spring", price: springBar.low, volume: springBar.volume ?? 0, volumeVsAvgPct: Math.round(((springBar.volume ?? 0) / avgVolume) * 100) };

    // Tim SOS: SAU Spring, breakout resistance voi volume+spread mo rong.
    let sosIdx = -1;
    for (let i = springIdx + 1; i < Math.min(bars.length, springIdx + 1 + p.maxBarsToSos); i++) {
      const bar = bars[i];
      const brokeResistance = bar.close > resistance;
      const highVolume = (bar.volume ?? 0) > avgVolume * p.highVolMult;
      const wideSpread = (bar.high - bar.low) > avgSpread;
      if (brokeResistance && highVolume && wideSpread) { sosIdx = i; break; }
    }

    let sos: WyckoffEvent | null = null;
    let lps: WyckoffEvent | null = null;
    let status: WyckoffSchematic["status"] = "spring_confirmed";

    if (sosIdx !== -1) {
      const sosBar = bars[sosIdx];
      sos = { date: sosBar.date, type: "sos", price: sosBar.close, volume: sosBar.volume ?? 0, volumeVsAvgPct: Math.round(((sosBar.volume ?? 0) / avgVolume) * 100) };
      status = "sos_confirmed";

      // Tim LPS: SAU SOS, pullback nhe (giu tren muc breakout trong
      // tolerance) voi volume thap (xac nhan khong co ban manh).
      for (let i = sosIdx + 1; i < Math.min(bars.length, sosIdx + 1 + p.maxBarsToLps); i++) {
        const bar = bars[i];
        const heldAboveBreakout = bar.low >= resistance * (1 - p.lpsPullbackTolerance);
        const isPullback = bar.close < sosBar.close;
        const lowVolume = (bar.volume ?? 0) < avgVolume;
        if (heldAboveBreakout && isPullback && lowVolume) {
          lps = { date: bar.date, type: "lps", price: bar.low, volume: bar.volume ?? 0, volumeVsAvgPct: Math.round(((bar.volume ?? 0) / avgVolume) * 100) };
          status = "lps_confirmed";
          break;
        }
      }
    }

    const newSchematic: WyckoffSchematic = { range, spring, sos, lps, status };
    if (!bestSchematic || statusRank[status] >= statusRank[bestSchematic.status]) {
      bestSchematic = newSchematic;
    }
  }
  return bestSchematic; // ket qua la schematic co status TOT NHAT tim duoc (uu tien lps > sos > spring > range_only), va MOI NHAT trong so cac schematic cung status
}
