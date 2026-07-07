import { EventEmitter } from "./EventEmitter";
import type { DomainPoint } from "./ChartManager";

export interface PriceZone {
  id: string; startBarIndex: number; endBarIndex: number;
  topPrice: number; bottomPrice: number; createdAt: number;
}
export interface DrawingManagerEvents extends Record<string, unknown> {
  "zone:created": PriceZone;
  "zone:draft-updated": { start: DomainPoint; current: DomainPoint } | null;
  "zone:deleted": { id: string };
}

export class DrawingManager {
  private zones: PriceZone[] = [];
  private draftStart: DomainPoint | null = null;
  private emitter = new EventEmitter<DrawingManagerEvents>();
  private idCounter = 0;

  on<K extends keyof DrawingManagerEvents>(event: K, handler: (payload: DrawingManagerEvents[K]) => void): () => void {
    return this.emitter.on(event, handler);
  }
  startDraw(point: DomainPoint): void {
    this.draftStart = point;
    this.emitter.emit("zone:draft-updated", { start: point, current: point });
  }
  updateDraw(currentPoint: DomainPoint): void {
    if (!this.draftStart) return;
    this.emitter.emit("zone:draft-updated", { start: this.draftStart, current: currentPoint });
  }
  finishDraw(endPoint: DomainPoint): PriceZone | null {
    if (!this.draftStart) return null;
    const zone: PriceZone = {
      id: `zone-${++this.idCounter}-${Date.now()}`,
      startBarIndex: Math.min(this.draftStart.barIndex, endPoint.barIndex),
      endBarIndex: Math.max(this.draftStart.barIndex, endPoint.barIndex),
      topPrice: Math.max(this.draftStart.price, endPoint.price),
      bottomPrice: Math.min(this.draftStart.price, endPoint.price),
      createdAt: Date.now(),
    };
    const minRange = (this.draftStart.price || 1) * 0.001;
    if (zone.topPrice - zone.bottomPrice < minRange || Math.abs(zone.endBarIndex - zone.startBarIndex) < 0.5) {
      this.draftStart = null;
      this.emitter.emit("zone:draft-updated", null);
      return null;
    }
    this.zones.push(zone);
    this.draftStart = null;
    this.emitter.emit("zone:draft-updated", null);
    this.emitter.emit("zone:created", zone);
    return zone;
  }
  cancelDraw(): void { this.draftStart = null; this.emitter.emit("zone:draft-updated", null); }
  deleteZone(id: string): void {
    this.zones = this.zones.filter((z) => z.id !== id);
    this.emitter.emit("zone:deleted", { id });
  }
  getZones(): PriceZone[] { return this.zones; }
  clearAll(): void {
    const ids = this.zones.map((z) => z.id);
    this.zones = [];
    ids.forEach((id) => this.emitter.emit("zone:deleted", { id }));
  }
}