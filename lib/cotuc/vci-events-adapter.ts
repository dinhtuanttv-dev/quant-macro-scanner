// VCI Events Adapter - lay THAT su kien GDKHQ (DIV), Phat hanh CP (ISS)
// va DHCD (AGME/AGMR/EGME) tu Vietcap. Endpoint KHONG CHINH THUC
// (reverse-engineer tu vnstock), cung rui ro nhu vci-listing-adapter.ts
// va vci-financials-adapter.ts da dung truoc do trong du an.
//
// FIX QUAN TRONG (2026-09-12, lam trong luc chuan hoa P1): field
// "exerciseDate" TRUOC DAY doc tu e.exerciseDate/e.exercise_date/
// e.exerDate - KHONG CO field nao ten nhu vay trong du lieu THAT (da xac
// nhan qua debug 17 ma) - ten dung la "exrightDate". "exerciseDate" luon
// la null tu truoc den gio. Da sua dung.

const IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";

export interface VciEvent {
  eventCode: string;        // "DIV" | "ISS" | "AGME" | "AGMR" | "EGME" | ...
  publicDate: string | null;   // Ngay cong bo (ISO)
  exerciseDate: string | null; // Ngay GDKHQ (voi DIV/ISS) hoac ngay hop (voi AGME) - FIX: doc dung tu exrightDate/issueDate
  eventTitle: string | null;
  ratio: string | null;        // Ty le co tuc/thuong (so, VD 0.1 = 10%)
}

export interface DividendEventResult {
  ticker: string;
  available: boolean;
  exDividendEvents: VciEvent[];
  agmEvents: VciEvent[];
  rawEvents: any[]; // FULL raw events (chua qua rut gon) - dung cho buildLifecycleEvents (P1)
  error?: string;
}

/** Chuyen ISO datetime string (VD "2026-06-19T00:00:00") sang date-only string. */
function toDateOnly(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * FIX QUAN TRONG: .filter() KHONG dam bao thu tu theo ngay (phu thuoc
 * thu tu VCI tra ve, khong nhat quan). Neu FE lay [0] lam "su kien gan
 * nhat" ma mang khong duoc sap xep dung, co the lay NHAM su kien CU du
 * co su kien MOI hon trong du lieu - gay hien tuong "ma da qua GDKHQ
 * van hien tren bang chinh" du THUC RA da co dot moi.
 *
 * Uu tien: (1) su kien SAP TOI GAN NHAT (exerciseDate >= hom nay, tang
 * dan - lay cai gan nhat), neu KHONG CO thi (2) su kien DA QUA GAN NHAT
 * (giam dan - lay cai gan day nhat). Dam bao FE luon nhan dung "su kien
 * dang can quan tam nhat" o vi tri [0].
 */
function sortEventsByRelevance(events: VciEvent[]): VciEvent[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.exerciseDate !== null && e.exerciseDate >= todayStr)
    .sort((a, b) => (a.exerciseDate as string).localeCompare(b.exerciseDate as string));
  const past = events.filter((e) => e.exerciseDate !== null && e.exerciseDate < todayStr)
    .sort((a, b) => (b.exerciseDate as string).localeCompare(a.exerciseDate as string));
  const noDate = events.filter((e) => e.exerciseDate === null);
  return [...upcoming, ...past, ...noDate];
}

export async function fetchDividendEvents(ticker: string, monthsBack = 60, monthsForward = 6): Promise<DividendEventResult> {
  try {
    const now = new Date();
    const from = new Date(now); from.setMonth(from.getMonth() - monthsBack);
    const to = new Date(now); to.setMonth(to.getMonth() + monthsForward);

    const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
    const toStr = to.toISOString().slice(0, 10).replace(/-/g, "");

    const url = `${IQ_BASE_URL}/v1/events?ticker=${ticker}&fromDate=${fromStr}&toDate=${toStr}&eventCode=DIV,ISS,AGME,AGMR,EGME&page=0&size=100`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI HTTP ${res.status}` };
    }

    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Không rõ nguyên nhân";
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: `VCI báo lỗi: ${String(reason).slice(0, 150)}` };
    }

    const rawEvents: any[] = json?.data?.content ?? (Array.isArray(json?.data) ? json.data : []);

    // FIX: dung dung ten field that (exrightDate cho DIV/ISS, issueDate cho AGM)
    const events: VciEvent[] = rawEvents.map((e) => ({
      eventCode: e.eventCode ?? "",
      publicDate: toDateOnly(e.publicDate),
      exerciseDate: toDateOnly(e.exrightDate ?? e.issueDate ?? null),
      eventTitle: e.eventTitleVi ?? e.eventTitleEn ?? null,
      ratio: e.exerciseRatio !== undefined && e.exerciseRatio !== null ? String(e.exerciseRatio) : null,
    }));

    return {
      ticker, available: true,
      exDividendEvents: sortEventsByRelevance(events.filter((e) => e.eventCode === "DIV")),
      agmEvents: sortEventsByRelevance(events.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode))),
      rawEvents,
    };
  } catch (err) {
    return { ticker, available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lay su kien cho nhieu ma song song, KHONG de 1 ma loi lam hong ca danh sach. */
export async function fetchDividendEventsBatch(tickers: string[]): Promise<DividendEventResult[]> {
  const results = await Promise.allSettled(tickers.map((t) => fetchDividendEvents(t)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], available: false, exDividendEvents: [], agmEvents: [], rawEvents: [], error: "Promise rejected" }
  );
}
