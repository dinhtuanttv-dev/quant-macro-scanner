import { ChartManager, type OhlcvBar, type ChartDimensions } from "./ChartManager";
import { DrawingManager, type PriceZone } from "./DrawingManager";
import { AIEngine, type ZoneAnalysisResult } from "./AIEngine";
import { EventEmitter } from "./EventEmitter";

export interface DraftZonePixels { x1: number; y1: number; x2: number; y2: number; }
interface ControllerEvents extends Record<string, unknown> {
  "log:updated": ZoneAnalysisResult[];
  "zones:updated": PriceZone[];
  "draft:updated": DraftZonePixels | null;
}

export class TaController {
  private chart: ChartManager;
  private drawing: DrawingManager;
  private ai: AIEngine;
  private emitter = new EventEmitter<ControllerEvents>();
  private log: ZoneAnalysisResult[] = [];
  private bars: OhlcvBar[];
  private isDrawing = false;
  private unsubscribers: (() => void)[] = [];

  constructor(bars: OhlcvBar[], dims: ChartDimensions) {
    this.bars = bars;
    this.chart = new ChartManager(bars, dims);
    this.drawing = new DrawingManager();
    this.ai = new AIEngine();

    const unsubCreated = this.drawing.on("zone:created", (zone) => {
      const currentPrice = this.chart.getCurrentPrice();
      if (currentPrice === null) return;
      const result = this.ai.analyzeZone(zone, this.bars, currentPrice);
      this.log = [result, ...this.log].slice(0, 20);
      this.emitter.emit("log:updated", this.log);
      this.emitter.emit("zones:updated", this.drawing.getZones());
    });
    const unsubDeleted = this.drawing.on("zone:deleted", () => {
      this.emitter.emit("zones:updated", this.drawing.getZones());
    });
    const unsubDraft = this.drawing.on("zone:draft-updated", (draft) => {
      if (!draft) { this.emitter.emit("draft:updated", null); return; }
      const p1 = this.chart.domainToPixel(draft.start);
      const p2 = this.chart.domainToPixel(draft.current);
      this.emitter.emit("draft:updated", { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    });
    this.unsubscribers.push(unsubCreated, unsubDeleted, unsubDraft);
  }

  updateData(bars: OhlcvBar[], dims: ChartDimensions): void { this.bars = bars; this.chart.update(bars, dims); }
  handlePixelDown(x: number, y: number): void { this.isDrawing = true; this.drawing.startDraw(this.chart.pixelToDomain(x, y)); }
  handlePixelMove(x: number, y: number): void { if (!this.isDrawing) return; this.drawing.updateDraw(this.chart.pixelToDomain(x, y)); }
  handlePixelUp(x: number, y: number): void { if (!this.isDrawing) return; this.isDrawing = false; this.drawing.finishDraw(this.chart.pixelToDomain(x, y)); }
  cancelDrawing(): void { this.isDrawing = false; this.drawing.cancelDraw(); }
  deleteZone(id: string): void { this.drawing.deleteZone(id); }
  clearAllZones(): void { this.drawing.clearAll(); this.log = []; this.emitter.emit("log:updated", this.log); }

  getZonesForRender() {
    return this.drawing.getZones().map((zone) => ({
      zone,
      pixelTop: this.chart.priceToPixel(zone.topPrice),
      pixelBottom: this.chart.priceToPixel(zone.bottomPrice),
      pixelLeft: this.chart.barIndexToPixel(zone.startBarIndex),
      pixelRight: this.chart.barIndexToPixel(zone.endBarIndex),
    }));
  }
  getLog(): ZoneAnalysisResult[] { return this.log; }
  onLogUpdated(h: (log: ZoneAnalysisResult[]) => void) { return this.emitter.on("log:updated", h); }
  onZonesUpdated(h: (zones: PriceZone[]) => void) { return this.emitter.on("zones:updated", h); }
  onDraftUpdated(h: (draft: DraftZonePixels | null) => void) { return this.emitter.on("draft:updated", h); }
  destroy(): void { this.unsubscribers.forEach((u) => u()); this.emitter.clear(); }
}