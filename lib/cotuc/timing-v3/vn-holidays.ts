/**
 * vn-holidays.ts - Lich nghi giao dich VN cho phan DEM NGAY TUONG LAI o backend (cron timing-signals-scan).
 *
 * KHONG con danh sach nhap tay: quy tac tu tinh cho moi nam (vn-trading-calendar.ts: am lich + Bo luat Lao dong, kiem
 * chung 10 nam phien that) + lop Market Gateway /api/market/trading-calendar (QUAN SAT phien that + MARKET_HOLIDAYS) de
 * bat ngay nghi noi do Chinh phu doi ngay lam viec. Cron goi refreshVnHolidayCalendar() mot lan moi luot; loi -> quy tac.
 * Backtest lich su KHONG dung lich nay (tu suy lich giao dich tu chuoi gia that - date-utils.ts).
 */
import type { HolidayCalendar } from "./date-utils";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { fetchGatewayHolidays, makeVnTradingCalendar, type GatewayHolidays } from "./vn-trading-calendar";

let current = makeVnTradingCalendar(null);
let loadedAt = 0;
const TTL_MS = 6 * 3_600_000;

/** Lich dung chung (dong bo). Mac dinh = quy tac tu tinh; sau refreshVnHolidayCalendar() co them lop Gateway. */
export const vnHolidayCalendar: HolidayCalendar = { isTradingDay: (dayNumber) => current.isTradingDay(dayNumber) };

/** Dat lop Gateway truc tiep (test / khi da co san danh sach). null = chi quy tac. */
export function setGatewayHolidays(g: GatewayHolidays | null): void {
  current = makeVnTradingCalendar(g);
  loadedAt = g ? Date.now() : 0;
}

/** Nap lop Gateway cho [nam truoc, 2 nam toi] (cache 6 gio). Tra ve true neu da co lop Gateway. */
export async function refreshVnHolidayCalendar({ fetchImpl = fetch, force = false }: { fetchImpl?: typeof fetch; force?: boolean } = {}): Promise<boolean> {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return true;
  const y = new Date().getUTCFullYear();
  const g = await fetchGatewayHolidays(MARKET_GATEWAY_URL, `${y - 1}-01-01`, `${y + 2}-12-31`, { fetchImpl });
  if (g) setGatewayHolidays(g);
  return g !== null;
}
