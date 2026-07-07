export interface OhlcvBar { date: string; open: number; high: number; low: number; close: number; volume: number; }
export interface ChartDimensions { width: number; height: number; paddingTop: number; paddingBottom: number; }
export interface DomainPoint { barIndex: number; price: number; }

export class ChartManager {
  private bars: OhlcvBar[];
  private dims: ChartDimensions;
  private minPrice: number;
  private maxPrice: number;

  constructor(bars: OhlcvBar[], dims: ChartDimensions) {
    this.bars = bars; this.dims = dims;
    this.minPrice = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : 0;
    this.maxPrice = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : 1;
  }
  update(bars: OhlcvBar[], dims: ChartDimensions): void {
    this.bars = bars; this.dims = dims;
    this.minPrice = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : 0;
    this.maxPrice = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : 1;
  }
  getBars(): OhlcvBar[] { return this.bars; }
  getCurrentPrice(): number | null { return this.bars.length > 0 ? this.bars[this.bars.length - 1].close : null; }
  pixelToPrice(pixelY: number): number {
    const h = this.dims.height - this.dims.paddingTop - this.dims.paddingBottom;
    const ratio = 1 - (pixelY - this.dims.paddingTop) / h;
    return this.minPrice + ratio * (this.maxPrice - this.minPrice);
  }
  priceToPixel(price: number): number {
    const h = this.dims.height - this.dims.paddingTop - this.dims.paddingBottom;
    const range = this.maxPrice - this.minPrice || 1;
    return this.dims.paddingTop + (1 - (price - this.minPrice) / range) * h;
  }
  pixelToBarIndex(pixelX: number): number {
    if (this.bars.length === 0) return 0;
    return pixelX / (this.dims.width / this.bars.length);
  }
  barIndexToPixel(barIndex: number): number {
    if (this.bars.length === 0) return 0;
    const bw = this.dims.width / this.bars.length;
    return barIndex * bw + bw / 2;
  }
  pixelToDomain(pixelX: number, pixelY: number): DomainPoint {
    return { barIndex: this.pixelToBarIndex(pixelX), price: this.pixelToPrice(pixelY) };
  }
  domainToPixel(point: DomainPoint): { x: number; y: number } {
    return { x: this.barIndexToPixel(point.barIndex), y: this.priceToPixel(point.price) };
  }
  getMinPrice(): number { return this.minPrice; }
  getMaxPrice(): number { return this.maxPrice; }
}