// Timeframe Controller - quan ly D (Daily) / W (Weekly).
// W tinh bang cach GOP nen Daily co san (HARD_DATA, khong goi API
// moi). H4/M1 CHUA trien khai vi Yahoo Finance chi giu du lieu 1
// phut trong 7 ngay gan nhat va CHUA xac minh duoc co day du du
// lieu intraday cho ma VN hay khong - de tranh hua hen sai.

import type { OhlcvBar } from "@/lib/ta-drawing/ChartManager";

export type Timeframe = "D" | "W";

export function aggregateToWeekly(dailyBars: OhlcvBar[]): OhlcvBar[] {
  if (dailyBars.length === 0) return [];
  const weeks = new Map<string, OhlcvBar[]>();

  dailyBars.forEach((bar) => {
    const date = new Date(bar.date + "T00:00:00Z");
    const day = date.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() + diffToMonday);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(bar);
  });

  const weeklyBars: OhlcvBar[] = [];
  Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([weekStart, bars]) => {
      weeklyBars.push({
        date: weekStart,
        open: bars[0].open,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((s, b) => s + b.volume, 0),
      });
    });
  return weeklyBars;
}

export class TimeframeController {
  private currentTimeframe: Timeframe = "D";
  private dailyBars: OhlcvBar[] = [];

  setDailyBars(bars: OhlcvBar[]): void { this.dailyBars = bars; }
  getTimeframe(): Timeframe { return this.currentTimeframe; }
  setTimeframe(tf: Timeframe): void { this.currentTimeframe = tf; }

  getBarsForCurrentTimeframe(): OhlcvBar[] {
    if (this.currentTimeframe === "W") return aggregateToWeekly(this.dailyBars);
    return this.dailyBars;
  }
}