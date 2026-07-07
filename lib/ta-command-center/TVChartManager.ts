// TVChartManager - bọc TradingView Lightweight Charts (v4.x)
// TRÁCH NHIỆM DUY NHẤT: khởi tạo chart, vẽ nến/volume, quy đổi
// pixel <-> giá/thời gian bằng API thật của thư viện (chính xác
// hơn tự tính tay). KHÔNG chứa logic vẽ vùng hay logic AI.

import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, UTCTimestamp } from "lightweight-charts";
import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";

function toTime(dateStr: string): UTCTimestamp {
  return (new Date(dateStr + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
}

export class TVChartManager {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private volumeSeries: ISeriesApi<"Histogram">;

  constructor(container: HTMLElement, bars: OhlcvBar[]) {
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontSize: 10 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: false },
    });

    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });
    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    this.setData(bars);
  }

  setData(bars: OhlcvBar[]): void {
    const candleData: CandlestickData[] = bars.map((b) => ({
      time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    const volData: HistogramData[] = bars.map((b) => ({
      time: toTime(b.date), value: b.volume,
      color: b.close >= b.open ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
    }));
    this.candleSeries.setData(candleData);
    this.volumeSeries.setData(volData);
    this.chart.timeScale().fitContent();
  }

  resize(width: number, height: number = 360): void {
    this.chart.resize(width, height);
  }

  priceToPixel(price: number): number | null {
    return this.candleSeries.priceToCoordinate(price);
  }
  pixelToPrice(y: number): number | null {
    return this.candleSeries.coordinateToPrice(y);
  }
  timeToPixel(dateStr: string): number | null {
    return this.chart.timeScale().timeToCoordinate(toTime(dateStr));
  }
  pixelToDate(x: number): string | null {
    const time = this.chart.timeScale().coordinateToTime(x);
    if (time === null) return null;
    return new Date((time as number) * 1000).toISOString().slice(0, 10);
  }

  onVisibleRangeChange(cb: () => void): () => void {
    this.chart.timeScale().subscribeVisibleTimeRangeChange(cb);
    return () => this.chart.timeScale().unsubscribeVisibleTimeRangeChange(cb);
  }

  destroy(): void { this.chart.remove(); }
}