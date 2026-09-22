// Elite 10 - Vung 2.5 "Chu Ky & Thoi Diem" (Time Engine, Phan XII cua
// Master Spec v3.0 + patch, package global-quanta-confluence). PORT +
// TONG QUAT HOA tu app/core/time_engine.py (Python), nuoi bang DU LIEU
// THAT (khong dung _synthetic_cycle_returns random.gauss nhu ban goc).
//
// PHAM VI DA XAC NHAN (rà soát 2026-09-14): 3/4 template kha thi that:
//   - Dividend (W1-W5): tai dung Timing Engine (P3) da lam cho Tab Co
//     Tuc (VCI events + Yahoo adjClose, da test khop 100%).
//   - AGM/DHCD (A1-A2): MOI - VCI co ngay DHCD that (eventCode AGME/
//     AGMR/EGME).
//   - Seasonal (theo thang): MOI - tinh truc tiep tu gia lich su Yahoo,
//     khong can nguon moi.
//   - Earnings (BCTC quy): BO - VCI KHONG co ngay cong bo BCTC that
//     (chi co ky bao cao, khac y nghia voi ngay thi truong phan ung).
//
// NGUYEN TAC BAT BIEN (12.1/12.2 ban goc, GIU NGUYEN):
//   - Time Verdict KHONG BAO GIO duoc cong vao Smart Score/Confluence
//     Score chinh - 2 truc doc lap hoan toan.
//   - sample_size < nguong PHAI gan co is_low_sample, khong am tham
//     hien thi nhu the dang tin cay ngang sample lon.
//   - Wyckoff phase KHONG duoc dua vao verdict (van la mock o Elite10,
//     chua co model ML that - xem MockDataBanner.tsx).

export interface TimeWindow {
  id: string; label: string; anchor: "before_event" | "after_event";
  offsetDays: [number, number]; holdDays: number;
}

export interface EventWindowTemplateDef {
  eventType: "dividend" | "agm" | "earnings" | "seasonal_month";
  label: string;
  windows: TimeWindow[];
}

export const DIVIDEND_TEMPLATE: EventWindowTemplateDef = {
  eventType: "dividend", label: "Chu kỳ cổ tức",
  windows: [
    { id: "W1", label: "Gom sớm trước Mốc 1", anchor: "before_event", offsetDays: [-75, -60], holdDays: 60 },
    { id: "W2", label: "Trước họp ĐHĐCĐ", anchor: "before_event", offsetDays: [-30, -15], holdDays: 20 },
    { id: "W3", label: "Trước GDKHQ (an toàn)", anchor: "before_event", offsetDays: [-25, -15], holdDays: 18 },
    { id: "W4", label: "Ngay sau GDKHQ", anchor: "after_event", offsetDays: [3, 6], holdDays: 4 },
    { id: "W5", label: "Sau khi CP/tiền về TK", anchor: "after_event", offsetDays: [20, 35], holdDays: 15 },
  ],
};

export const AGM_TEMPLATE: EventWindowTemplateDef = {
  eventType: "agm", label: "Đại hội đồng cổ đông",
  windows: [
    { id: "A1", label: "Trước ĐHCĐ 10 ngày", anchor: "before_event", offsetDays: [-10, 0], holdDays: 10 },
    { id: "A2", label: "Sau ĐHCĐ 5 ngày", anchor: "after_event", offsetDays: [0, 5], holdDays: 5 },
  ],
};

// Earnings/BCTC quy - CAU TRUC DA SAN SANG, CHUA CO NGUON NGAY CONG BO
// THAT (VCI chi co ky bao cao, khong co ngay thi truong phan ung). KHI
// CO NGUON (VD tich hop them 1 API/scrape khac cung cap ngay cong bo
// that), chi can: (1) viet ham fetchEarningsDates(ticker) tra ve ngay
// that, (2) goi computeEventWindowReturns+buildWindowStats y het pattern
// Dividend/AGM - KHONG CAN SUA GI O day.
export const EARNINGS_TEMPLATE: EventWindowTemplateDef = {
  eventType: "earnings", label: "Công bố BCTC quý (chưa có dữ liệu)",
  windows: [
    { id: "E1", label: "Trước công bố BCTC", anchor: "before_event", offsetDays: [-7, 0], holdDays: 7 },
    { id: "E2", label: "Sau công bố BCTC", anchor: "after_event", offsetDays: [0, 3], holdDays: 3 },
  ],
};

export const TIME_MIN_SAMPLE_FOR_SIGNAL = 10;
export const TIME_MIN_SAMPLE_FOR_CONFIDENT = 30;

export interface PriceBar { date: string; adjClose: number; }

function priceOnOrBefore(prices: PriceBar[], targetDate: Date, maxLookbackDays = 5): number | null {
  const targetStr = targetDate.toISOString().slice(0, 10);
  const minDate = new Date(targetDate); minDate.setDate(minDate.getDate() - maxLookbackDays);
  const minStr = minDate.toISOString().slice(0, 10);
  const window = prices.filter((p) => p.date <= targetStr && p.date >= minStr);
  if (window.length === 0) return null;
  return window.sort((a, b) => a.date.localeCompare(b.date))[window.length - 1].adjClose;
}

/** % loi nhuan cho MOI cua so cua 1 template, quanh 1 ngay su kien cu the. */
export function computeEventWindowReturns(prices: PriceBar[], eventDate: string, template: EventWindowTemplateDef): Record<string, number | null> {
  const ev = new Date(eventDate);
  const out: Record<string, number | null> = {};
  for (const w of template.windows) {
    const fromDate = new Date(ev); fromDate.setDate(fromDate.getDate() + w.offsetDays[0]);
    const toDate = new Date(ev); toDate.setDate(toDate.getDate() + w.offsetDays[1]);
    const pFrom = priceOnOrBefore(prices, fromDate);
    const pTo = priceOnOrBefore(prices, toDate);
    out[w.id] = pFrom !== null && pTo !== null && pFrom !== 0 ? Math.round((pTo / pFrom - 1) * 10000) / 100 : null;
  }
  return out;
}

function mean(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function bootstrapCI90(returns: number[], nBoot = 2000): [number, number] {
  if (returns.length === 0) return [0, 0];
  const means: number[] = [];
  for (let b = 0; b < nBoot; b++) {
    let s = 0;
    for (let i = 0; i < returns.length; i++) s += returns[Math.floor(Math.random() * returns.length)];
    means.push(s / returns.length);
  }
  means.sort((a, b) => a - b);
  const idx = (p: number) => means[Math.min(means.length - 1, Math.floor((p / 100) * means.length))];
  return [Math.round(idx(5) * 100) / 100, Math.round(idx(95) * 100) / 100];
}

export interface WindowStat {
  windowId: string; label: string;
  avgReturn: number; winRate: number; ci90: [number, number];
  annualizedScore: number; sampleSize: number; isLowSample: boolean; isCurrent: boolean;
}

/** rows: 1 dong = 1 su kien lich su, key = window.id, value = % return (co the null). */
export function buildWindowStats(rows: Record<string, number | null>[], template: EventWindowTemplateDef): WindowStat[] {
  return template.windows.map((w) => {
    const returns = rows.map((r) => r[w.id]).filter((v): v is number => v !== null && !Number.isNaN(v));
    const n = returns.length;
    if (n === 0) {
      return { windowId: w.id, label: w.label, avgReturn: 0, winRate: 0, ci90: [0, 0], annualizedScore: 0, sampleSize: 0, isLowSample: true, isCurrent: false };
    }
    const avgReturn = Math.round(mean(returns) * 100) / 100;
    const winRate = Math.round((returns.filter((r) => r > 0).length / n) * 100) / 100;
    const ci90 = bootstrapCI90(returns);
    const annualizedReturn = Math.pow(1 + avgReturn / 100, 365 / Math.max(w.holdDays, 1)) - 1;
    const annualizedScore = Math.round(annualizedReturn * 100 * (0.5 + winRate) * 10) / 10;
    return {
      windowId: w.id, label: w.label, avgReturn, winRate, ci90, annualizedScore,
      sampleSize: n, isLowSample: n < TIME_MIN_SAMPLE_FOR_CONFIDENT, isCurrent: false,
    };
  });
}

/** Xac dinh cua so HIEN TAI dua tren so ngay con lai toi su kien tiep theo. */
export function findCurrentWindow(daysToEvent: number, template: EventWindowTemplateDef, stats: WindowStat[]): WindowStat | null {
  for (let i = 0; i < template.windows.length; i++) {
    const w = template.windows[i];
    const [lo, hi] = w.offsetDays;
    if (lo <= -daysToEvent && -daysToEvent <= hi) return stats[i];
  }
  return null;
}

export type TimingAction = "MUA_TICH_LUY" | "CHO" | "QUAN_SAT";
export type TimingConfidence = "cao" | "trung_binh" | "thap";

export interface SeasonalStat { month: number; avgReturn: number; winRate: number; sampleSize: number; isLowSample: boolean; }

export interface TimingVerdict {
  ticker: string;
  action: TimingAction;
  confidence: TimingConfidence;
  recommendationScore: number;
  currentWindow: WindowStat | null;
  daysToNextEvent: number | null;
  nextEventDate: string | null;
  agreements: string[];
  conflicts: string[];
  windows: WindowStat[];
  disclaimer: string;
  // MINH BACH (giong MockDataBanner cua Elite10): 2 truong nay LUON null/
  // false o giai doan hien tai - CHUA CO NGUON DU LIEU THAT, KHONG duoc
  // dua vao verdict de tranh bia so lieu. UI PHAI hien thi ro "sap co",
  // khong duoc de nguoi dung nham day la da tich hop.
  wyckoffPhase: string | null;
  wyckoffIntegrated: false;
  earningsWindows: WindowStat[] | null;
  earningsIntegrated: false;
}

// 12.4 - Time Confluence Verdict. PORT co DIEU CHINH: BO hoan toan yeu
// to Wyckoff phase (van la mock o Elite10, KHONG dua du lieu gia vao
// quyet dinh dau tu) - chi dung 2 yeu to THAT: cua so hien tai (dividend)
// + hieu ung mua vu thang hien tai (tinh tu gia that).
export function timeConfluenceVerdict(
  ticker: string,
  dividendWindows: WindowStat[],
  daysToNextDividend: number | null,
  nextDividendDate: string | null,
  currentMonthSeasonal: SeasonalStat | null
): TimingVerdict {
  const agreements: string[] = [];
  const conflicts: string[] = [];
  let positiveHits = 0;
  let negativeHits = 0;

  const current = daysToNextDividend !== null ? findCurrentWindow(daysToNextDividend, DIVIDEND_TEMPLATE, dividendWindows) : null;
  if (current) current.isCurrent = true;

  if (current) {
    if (current.avgReturn > 0 && current.winRate >= 0.55 && !current.isLowSample) {
      positiveHits++;
      agreements.push(`Cửa sổ hiện tại ${current.windowId} (${current.label}) có lịch sử tốt: TB ${current.avgReturn >= 0 ? "+" : ""}${current.avgReturn}%, thắng ${Math.round(current.winRate * 100)}%.`);
    } else if (current.avgReturn < 0 || current.winRate < 0.45) {
      negativeHits++;
      conflicts.push(`Cửa sổ hiện tại ${current.windowId} (${current.label}) có lịch sử yếu: TB ${current.avgReturn >= 0 ? "+" : ""}${current.avgReturn}%, thắng ${Math.round(current.winRate * 100)}%.`);
    }
  }

  if (currentMonthSeasonal && !currentMonthSeasonal.isLowSample) {
    if (currentMonthSeasonal.avgReturn > 0.2 && currentMonthSeasonal.winRate > 0.55) {
      positiveHits++;
      agreements.push(`Hiệu ứng mùa vụ tháng ${currentMonthSeasonal.month} lịch sử thuận lợi (TB ${currentMonthSeasonal.avgReturn >= 0 ? "+" : ""}${currentMonthSeasonal.avgReturn}%, thắng ${Math.round(currentMonthSeasonal.winRate * 100)}%).`);
    } else if (currentMonthSeasonal.avgReturn < -0.2 && currentMonthSeasonal.winRate < 0.5) {
      negativeHits++;
      conflicts.push(`Hiệu ứng mùa vụ tháng ${currentMonthSeasonal.month} lịch sử yếu (TB ${currentMonthSeasonal.avgReturn >= 0 ? "+" : ""}${currentMonthSeasonal.avgReturn}%, thắng ${Math.round(currentMonthSeasonal.winRate * 100)}%).`);
    }
  }

  let action: TimingAction, confidence: TimingConfidence, recommendationScore: number;
  if (positiveHits >= 2 && negativeHits === 0) {
    action = "MUA_TICH_LUY"; confidence = "cao"; recommendationScore = 7;
  } else if (negativeHits > 0 && positiveHits <= negativeHits) {
    action = "CHO"; confidence = "trung_binh"; recommendationScore = 4;
  } else if (positiveHits >= 1) {
    action = "MUA_TICH_LUY"; confidence = "trung_binh"; recommendationScore = 6;
  } else {
    action = "QUAN_SAT"; confidence = "thap"; recommendationScore = 5;
  }

  return {
    ticker, action, confidence, recommendationScore,
    currentWindow: current, daysToNextEvent: daysToNextDividend, nextEventDate: nextDividendDate,
    agreements, conflicts, windows: dividendWindows,
    disclaimer: "Thống kê lịch sử, không phải khuyến nghị đầu tư — quá khứ không đảm bảo tương lai.",
    wyckoffPhase: null, wyckoffIntegrated: false,
    earningsWindows: null, earningsIntegrated: false,
  };
}

/** Tinh % thay doi gia trung binh THEO THANG (N nam qua) - dung cho
 * Seasonal Template, tu gia lich su THAT (khong can nguon moi). */
export function computeSeasonalStats(bars: { date: string; adjClose: number }[]): SeasonalStat[] {
  const byYearMonth = new Map<string, { first: number; last: number }>();
  for (const b of bars) {
    const ym = b.date.slice(0, 7);
    const cur = byYearMonth.get(ym);
    if (!cur) byYearMonth.set(ym, { first: b.adjClose, last: b.adjClose });
    else cur.last = b.adjClose;
  }
  const monthReturns: number[][] = Array.from({ length: 12 }, () => []);
  for (const [ym, { first, last }] of byYearMonth.entries()) {
    const month = parseInt(ym.slice(5, 7), 10) - 1;
    if (first > 0) monthReturns[month].push(Math.round(((last / first - 1) * 100) * 100) / 100);
  }
  return monthReturns.map((returns, i) => {
    const n = returns.length;
    if (n === 0) return { month: i + 1, avgReturn: 0, winRate: 0, sampleSize: 0, isLowSample: true };
    return {
      month: i + 1,
      avgReturn: Math.round(mean(returns) * 100) / 100,
      winRate: Math.round((returns.filter((r) => r > 0).length / n) * 100) / 100,
      sampleSize: n, isLowSample: n < TIME_MIN_SAMPLE_FOR_SIGNAL,
    };
  });
}
