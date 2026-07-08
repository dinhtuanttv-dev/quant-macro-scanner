// AnalysisController - LỚP DUY NHẤT được phép biết về DrawingManager,
// LayerManager, TimeframeController, AIEngine và các detector.

import { DrawingManager, type DrawnPrimitive } from "./DrawingManager";
import { LayerManager, type LayerState } from "./LayerManager";
import { AIEngine, type SignalLogEntry } from "./AIEngine";
import { TimeframeController, type Timeframe } from "./TimeframeController";
import { detectOrderBlocks, detectFVG, detectBOS, type OrderBlock, type FairValueGap, type BreakOfStructure } from "./detectors/smcDetector";
import { detectVSASignals, type VSASignal } from "./detectors/vsaDetector";
import type { PatternMatch } from "./detectors/patternScanner";
import { EventEmitter } from "@/lib/ta-drawing/EventEmitter";
import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";

interface ControllerEvents extends Record<string, unknown> {
  "log:updated": SignalLogEntry[];
  "primitives:updated": DrawnPrimitive[];
  "smc:updated": { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] };
  "vsa:updated": VSASignal[];
  "timeframe:changed": { timeframe: Timeframe; bars: OhlcvBar[] };
}

export class AnalysisController {
  drawing = new DrawingManager();
  layers = new LayerManager();
  timeframeController = new TimeframeController();
  private ai = new AIEngine();
  private emitter = new EventEmitter<ControllerEvents>();

  private bars: OhlcvBar[] = []; // bars theo timeframe hien tai
  private log: SignalLogEntry[] = [];
  private smcCache = { obs: [] as OrderBlock[], fvgs: [] as FairValueGap[], bos: [] as BreakOfStructure[] };
  private vsaCache: VSASignal[] = [];
  private unsubscribers: (() => void)[] = [];

  constructor(dailyBars: OhlcvBar[]) {
    this.timeframeController.setDailyBars(dailyBars);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();

    const unsubCreated = this.drawing.on("primitive:created", (primitive) => {
      this.emitter.emit("primitives:updated", this.drawing.getPrimitives());
      if (!this.layers.getState().aiDetectionMaster) return;
      const currentPrice = this.bars.length > 0 ? this.bars[this.bars.length - 1].close : 0;
      const newEntries = this.ai.analyzeAndCrossReference(primitive, this.smcCache, this.vsaCache, currentPrice);
      this.log = [...newEntries, ...this.log].slice(0, 30);
      this.emitter.emit("log:updated", this.log);
    });

    const unsubDeleted = this.drawing.on("primitive:deleted", () => {
      this.emitter.emit("primitives:updated", this.drawing.getPrimitives());
    });

    this.unsubscribers.push(unsubCreated, unsubDeleted);
  }

  /** Cap nhat du lieu Daily goc (khi doi ma chung khoan). */
  updateDailyBars(dailyBars: OhlcvBar[]): void {
    this.timeframeController.setDailyBars(dailyBars);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();
  }

  /** Doi khung thoi gian (D/W) - KHONG mat cac vung da ve, vi chung
   * luu theo {date, price} (domain), se tu dong re-project khi chart
   * ve lai voi bars moi (TVChartManager se snap-to-nearest-bar). */
  setTimeframe(tf: Timeframe): void {
    this.timeframeController.setTimeframe(tf);
    this.bars = this.timeframeController.getBarsForCurrentTimeframe();
    this.recomputeDetectors();
    this.emitter.emit("timeframe:changed", { timeframe: tf, bars: this.bars });
  }

  getCurrentTimeframe(): Timeframe { return this.timeframeController.getTimeframe(); }
  getCurrentBars(): OhlcvBar[] { return this.bars; }

  /** Ghi log tu Pattern Scanner (goi tu component PatternList khi
   * click 1 hang, hoac tu dong khi co pattern moi khop confluence). */
  logPatternConfluence(pattern: PatternMatch): void {
    const layerState = this.layers.getState();
    const entry = this.ai.analyzePatternConfluence(pattern, this.smcCache, this.vsaCache, {
      smc: layerState.smc, vsa: layerState.vsa, wyckoff: layerState.wyckoff, elliott: layerState.elliott,
    });
    this.log = [entry, ...this.log].slice(0, 30);
    this.emitter.emit("log:updated", this.log);
  }

  private recomputeDetectors(): void {
    this.smcCache = { obs: detectOrderBlocks(this.bars), fvgs: detectFVG(this.bars), bos: detectBOS(this.bars) };
    this.vsaCache = detectVSASignals(this.bars);
    this.emitter.emit("smc:updated", this.smcCache);
    this.emitter.emit("vsa:updated", this.vsaCache);
  }

  getSmc() { return this.smcCache; }
  getVsa(): VSASignal[] { return this.vsaCache; }
  getLog(): SignalLogEntry[] { return this.log; }
  getLayerState(): LayerState { return this.layers.getState(); }

  onLogUpdated(h: (log: SignalLogEntry[]) => void) { return this.emitter.on("log:updated", h); }
  onPrimitivesUpdated(h: (p: DrawnPrimitive[]) => void) { return this.emitter.on("primitives:updated", h); }
  onSmcUpdated(h: (s: { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] }) => void) { return this.emitter.on("smc:updated", h); }
  onVsaUpdated(h: (v: VSASignal[]) => void) { return this.emitter.on("vsa:updated", h); }
  onLayersChanged(h: (s: LayerState) => void) { return this.layers.on(h); }
  onTimeframeChanged(h: (payload: { timeframe: Timeframe; bars: OhlcvBar[] }) => void) { return this.emitter.on("timeframe:changed", h); }

  destroy(): void { this.unsubscribers.forEach((u) => u()); }
}