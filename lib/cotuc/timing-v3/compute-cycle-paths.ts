/**
 * backend/compute-cycle-paths.ts
 *
 * Tính CyclePathsV3 (đường CAR theo offset cho từng đợt lịch sử + đợt hiện tại) từ
 * chuỗi giá điều chỉnh của mã và benchmark. Đây là phần backend duy nhất mà tài liệu
 * v3 mục 4 còn thiếu (CycleStatsV3 chỉ có thống kê tóm tắt của cửa sổ).
 *
 * Thiết kế: hàm thuần `computeCyclePaths`, không I/O, không đọc đồng hồ hệ thống.
 * File `run.ts` cạnh đây là CLI mỏng đọc dữ liệu thật và gọi hàm này.
 *
 * Định vị offset dùng số ngày giao dịch THỰC (addTradingDays qua HolidayCalendar),
 * không dò theo chỉ số mảng giá. Điều này quan trọng cho GDKHQ tương lai (sự kiện
 * đang diễn ra): mảng giá lịch sử không "biết" GDKHQ đó nằm ở đâu, nhưng lịch giao
 * dịch (chỉ phụ thuộc ngày, không phụ thuộc có giá hay không) thì tính được.
 *
 * Phương pháp CAR (mục 5.2 tài liệu v3): lợi nhuận vượt trội thị trường
 * (market-adjusted: r_stock − r_benchmark theo log-return), KHÔNG dùng market model
 * đầy đủ (hồi quy alpha/beta) — đó là việc của Backtest Service (mục 5) khi chọn cửa
 * sổ. Ở đây chỉ dựng đường CAR để hiển thị.
 */
import { toDayNumber, dayNumberToIso } from './date-utils';
import type { HolidayCalendar } from './date-utils';

export type ISODate = string;

export interface PricePoint {
  /** Ngày giao dịch. */
  date: ISODate;
  /** Giá đóng cửa đã điều chỉnh cổ tức/thưởng (mục 2.3 tài liệu v3). */
  adjClose: number;
}

export interface DividendEventInput {
  exDate: ISODate;
}

export interface ComputeCyclePathsInput {
  ticker: string;
  stockPrices: PricePoint[];
  benchmarkPrices: PricePoint[];
  /** Toàn bộ đợt CASH lịch sử (đã xác nhận), sắp xếp thế nào cũng được. */
  events: DividendEventInput[];
  /** offsets ngày giao dịch muốn xuất, ví dụ [-40..15]. Phải tăng ngặt. */
  offsets: number[];
  /** Lịch giao dịch (nghỉ lễ + cuối tuần) dùng để định vị offset theo ngày giao dịch thực. */
  cal: HolidayCalendar;
  /** GDKHQ của đợt đang diễn ra, để vẽ currentPath. Bỏ trống hoặc null nếu không có. */
  currentExDate?: ISODate | null;
  version: string;
  asOf: string;
}

export interface CyclePathsOutput {
  ticker: string;
  version: string;
  asOf: string;
  offsets: number[];
  eventPaths: { exDate: ISODate; car: (number | null)[] }[];
  currentPath: (number | null)[] | null;
  /** Đợt bị loại vì thiếu dữ liệu giá tại điểm rebase. Dùng để log/giám sát chất lượng dữ liệu. */
  skippedEvents: { exDate: ISODate; reason: string }[];
}

function indexByDate(prices: PricePoint[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const p of prices) m.set(p.date, p.adjClose);
  return m;
}

/** Dịch `n` ngày giao dịch từ `dateIso` theo lịch `cal`. n âm ⇒ lùi về trước. */
export function addTradingDays(dateIso: ISODate, n: number, cal: HolidayCalendar): ISODate {
  const start = toDayNumber(dateIso);
  if (start === null) throw new Error(`ngày không hợp lệ: ${dateIso}`);
  if (n === 0) return dateIso;
  const step = n > 0 ? 1 : -1;
  let d = start;
  let count = 0;
  while (count !== Math.abs(n)) {
    d += step;
    if (cal.isTradingDay(d)) count++;
  }
  return dayNumberToIso(d);
}

function marketAdjustedLogReturn(pCur: number, pPrev: number, bCur: number, bPrev: number): number | null {
  if (pCur <= 0 || pPrev <= 0 || bCur <= 0 || bPrev <= 0) return null;
  return Math.log(pCur / pPrev) - Math.log(bCur / bPrev);
}

/**
 * Đường CAR cho một mốc gốc `exDate`: rebase tại offsets[0] (giá trị 0), cộng dồn
 * log-return market-adjusted tới từng offset kế tiếp có đủ giá. Thiếu giá ở một offset
 * chỉ để lại `null` tại đó; đợt vẫn tiếp tục dùng điểm có dữ liệu gần nhất trước đó
 * làm gốc so sánh cho offset kế tiếp, để một ngày thiếu giá không làm hỏng toàn bộ
 * phần còn lại.
 */
function buildOneCarPath(
  exDate: ISODate,
  offsets: number[],
  stockByDate: Map<ISODate, number>,
  benchByDate: Map<ISODate, number>,
  cal: HolidayCalendar,
): (number | null)[] {
  const priceAt = (date: ISODate): { s: number; b: number } | null => {
    const s = stockByDate.get(date);
    const b = benchByDate.get(date);
    if (s === undefined || b === undefined) return null;
    return { s, b };
  };

  const baseDate = addTradingDays(exDate, offsets[0], cal);
  const base = priceAt(baseDate);
  const out: (number | null)[] = new Array(offsets.length).fill(null);
  if (!base) return out; // không có giá tại điểm rebase ⇒ cả đợt không dùng được

  out[0] = 0;
  let cum = 0;
  let prev = base;

  for (let i = 1; i < offsets.length; i++) {
    const date = addTradingDays(exDate, offsets[i], cal);
    const cur = priceAt(date);
    if (!cur) {
      out[i] = null; // chưa có giá (tương lai) hoặc thiếu dữ liệu tại ngày này
      continue;
    }
    const r = marketAdjustedLogReturn(cur.s, prev.s, cur.b, prev.b);
    if (r === null) {
      out[i] = null;
      continue;
    }
    cum += r;
    out[i] = cum;
    prev = cur;
  }
  return out;
}

/**
 * Tính CyclePathsV3 (dạng backend, chưa gắn schema) từ giá và danh sách sự kiện.
 * Hàm thuần: cùng đầu vào luôn ra cùng đầu ra.
 */
export function computeCyclePaths(input: ComputeCyclePathsInput): CyclePathsOutput {
  const { ticker, stockPrices, benchmarkPrices, events, offsets, cal, currentExDate, version, asOf } = input;

  if (offsets.length < 2) throw new Error('offsets cần ít nhất 2 phần tử');
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] <= offsets[i - 1]) throw new Error('offsets phải tăng ngặt');
  }

  const stockByDate = indexByDate(stockPrices);
  const benchByDate = indexByDate(benchmarkPrices);

  const eventPaths: CyclePathsOutput['eventPaths'] = [];
  const skippedEvents: CyclePathsOutput['skippedEvents'] = [];

  const seen = new Set<ISODate>();
  for (const ev of events) {
    if (toDayNumber(ev.exDate) === null) {
      skippedEvents.push({ exDate: ev.exDate, reason: 'exDate không hợp lệ' });
      continue;
    }
    if (seen.has(ev.exDate)) {
      skippedEvents.push({ exDate: ev.exDate, reason: 'exDate trùng với một đợt đã có' });
      continue;
    }
    seen.add(ev.exDate);

    const car = buildOneCarPath(ev.exDate, offsets, stockByDate, benchByDate, cal);
    if (car[0] !== 0) {
      skippedEvents.push({ exDate: ev.exDate, reason: `thiếu giá tại offset ${offsets[0]} (điểm rebase)` });
      continue;
    }
    eventPaths.push({ exDate: ev.exDate, car });
  }

  eventPaths.sort((a, b) => (a.exDate < b.exDate ? -1 : a.exDate > b.exDate ? 1 : 0));

  let currentPath: (number | null)[] | null = null;
  if (currentExDate && toDayNumber(currentExDate) !== null) {
    const path = buildOneCarPath(currentExDate, offsets, stockByDate, benchByDate, cal);
    currentPath = path[0] === 0 ? path : null;
  }

  return { ticker, version, asOf, offsets, eventPaths, currentPath, skippedEvents };
}

/** Chuyển sang đúng hình dạng CyclePathsV3 của schema (bỏ trường chẩn đoán skippedEvents). */
export function toCyclePathsV3(out: CyclePathsOutput): Omit<CyclePathsOutput, 'skippedEvents'> {
  const { skippedEvents: _skipped, ...rest } = out;
  void _skipped;
  return rest;
}
