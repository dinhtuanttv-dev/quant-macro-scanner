import { NextResponse } from "next/server";
import { fetchIntradayBars } from "@/lib/market-data/vndirect-adapter";

export const maxDuration = 15;

// Gio VN (ICT, UTC+7): phien sang 09:00-10:30. Timestamp tra ve tu
// VNDirect la UTC epoch seconds -> can quy doi ve gio VN de loc dung.
function getVnHourMinute(unixSec: number): { hour: number; minute: number; dateKey: string } {
  const d = new Date(unixSec * 1000);
  const vnMs = d.getTime() + 7 * 60 * 60 * 1000; // dich UTC -> UTC+7
  const vnDate = new Date(vnMs);
  return {
    hour: vnDate.getUTCHours(),
    minute: vnDate.getUTCMinutes(),
    dateKey: vnDate.toISOString().slice(0, 10),
  };
}

function isBeforeOrAt1030(hour: number, minute: number): boolean {
  return hour < 10 || (hour === 10 && minute <= 30);
}

function isMorningSession(hour: number): boolean {
  return hour >= 9;
}

export async function GET() {
  try {
    const bars = await fetchIntradayBars("VNINDEX", 12, "15");
    if (bars.length === 0) {
      return NextResponse.json({ error: "Khong lay duoc du lieu intraday." }, { status: 502 });
    }

    // Gom volume theo tung ngay, chi tinh trong khung 09:00-10:30 gio VN
    const dailyLiquidity = new Map<string, number>();
    for (const bar of bars) {
      const { hour, minute, dateKey } = getVnHourMinute(bar.timestamp);
      if (isMorningSession(hour) && isBeforeOrAt1030(hour, minute)) {
        dailyLiquidity.set(dateKey, (dailyLiquidity.get(dateKey) ?? 0) + (bar.volume ?? 0));
      }
    }

    const sortedDays = Array.from(dailyLiquidity.keys()).sort();
    if (sortedDays.length < 2) {
      return NextResponse.json({ error: "Khong du du lieu lich su de so sanh." }, { status: 502 });
    }

    const todayKey = sortedDays[sortedDays.length - 1];
    const todayValue = dailyLiquidity.get(todayKey)!;
    const historyKeys = sortedDays.slice(-6, -1); // 5 phien truoc do (khong tinh hom nay)
    const historyValues = historyKeys.map((k) => dailyLiquidity.get(k)!);

    const mean = historyValues.reduce((a, b) => a + b, 0) / (historyValues.length || 1);
    const variance = historyValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (historyValues.length || 1);
    const stdev = Math.sqrt(variance);
    const zScore = stdev > 0 ? (todayValue - mean) / stdev : 0;
    const deviationPct = mean > 0 ? ((todayValue - mean) / mean) * 100 : 0;

    let signal: "extreme" | "elevated" | "normal" = "normal";
    if (Math.abs(zScore) > 2) signal = "extreme";
    else if (Math.abs(zScore) > 1) signal = "elevated";

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      today: { date: todayKey, cumulativeVolumeAt1030: todayValue },
      history: historyKeys.map((k, i) => ({ date: k, cumulativeVolumeAt1030: historyValues[i] })),
      stats: { mean, stdev, zScore, deviationPct, signal },
    });
  } catch (err) {
    console.error("[api/market-data/liquidity-1030] Loi:", err);
    return NextResponse.json({ error: "Khong tinh duoc thanh khoan 10:30." }, { status: 500 });
  }
}
