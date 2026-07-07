// AnalysisController - LỚP DUY NHẤT được phép biết về DrawingManager,
// LayerManager, AIEngine và detector SMC/VSA. Các lớp kia KHÔNG được
// gọi trực tiếp lẫn nhau.

import { DrawingManager, type DrawnPrimitive } from "./DrawingManager";
import { LayerManager, type LayerState } from "./LayerManager";
import { AIEngine, type SignalLogEntry } from "./AIEngine";
import { detectOrderBlocks, detectFVG, detectBOS, type OrderBlock, type FairValueGap, type BreakOfStructure } from "./detectors/smcDetector";
import { detectVSASignals, type VSASignal } from "./detectors/vsaDetector";
import { EventEmitter } from "@/lib/ta-drawing/EventEmitter";
import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";

interface ControllerEvents extends Record<string, unknown> {
  "log:updated": SignalLogEntry[];
  "primitives:updated": DrawnPrimitive[];
  "smc:updated": { obs: OrderBlock[]; fvgs: FairValueGap[]; bos: BreakOfStructure[] };
  "vsa:updated": VSASignal[];
}

export class AnalysisController {
  drawing = new DrawingManager();
  layers = new LayerManager();
  private ai = new AIEngine();
  private emitter = new EventEmitter<ControllerEvents>();

  private bars: OhlcvBar[] = [];
  private log: SignalLogEntry[] = [];
  private smcCache = { obs: [] as OrderBlock[], fvgs: [] as FairValueGap[], bos: [] as BreakOfStructure[] };
  private vsaCache: VSASignal[] = [];
  private unsubscribers: (() => void)[] = [];

  constructor(bars: OhlcvBar[]) {
    this.bars = bars;
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

  updateData(bars: OhlcvBar[]): void { this.bars = bars; this.recomputeDetectors(); }

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

  destroy(): void { this.unsubscribers.forEach((u) => u()); }
}