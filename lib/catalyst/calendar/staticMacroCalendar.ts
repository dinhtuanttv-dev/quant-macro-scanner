// lib/catalyst/calendar/staticMacroCalendar.ts
// Lich su kien vi mo THAT co chu ky cong bo cong khai da biet truoc.
// KHONG bia lich hop SBV (khong co lich chinh thuc cong khai co dinh).
// Lich FOMC can cap nhat lai HANG NAM khi Fed cong bo lich moi (thuong vao thang 12).

export interface StaticCalendarEvent {
  id: string;
  title: string;
  category: "macro";
  executionDate: Date;
  country: "VN" | "US";
}

function nextMonthlyDate(day: number, fromYear: number, fromMonth: number, monthsAhead: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(Date.UTC(fromYear, fromMonth - 1 + i, day));
    dates.push(d);
  }
  return dates;
}

const FOMC_2026_DATES = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];

export function buildStaticMacroCalendar(now: Date = new Date()): StaticCalendarEvent[] {
  const events: StaticCalendarEvent[] = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  nextMonthlyDate(29, year, month, 3).forEach((d) => {
    events.push({ id: `vn-cpi-${d.toISOString().slice(0, 10)}`, title: "GSO cong bo CPI & so lieu xuat nhap khau", category: "macro", executionDate: d, country: "VN" });
  });

  nextMonthlyDate(2, year, month, 3).forEach((d) => {
    events.push({ id: `vn-pmi-${d.toISOString().slice(0, 10)}`, title: "S&P Global cong bo PMI san xuat Viet Nam", category: "macro", executionDate: d, country: "VN" });
  });

  FOMC_2026_DATES.forEach((dateStr) => {
    const d = new Date(dateStr + "T19:00:00Z");
    if (d.getTime() > now.getTime()) {
      events.push({ id: `us-fomc-${dateStr}`, title: "Fed cong bo quyet dinh lai suat (FOMC)", category: "macro", executionDate: d, country: "US" });
    }
  });

  return events.filter((e) => e.executionDate.getTime() > now.getTime());
}
