// VCI Events Adapter - lay THAT su kien GDKHQ (DIV) va DHCD (AGME/AGMR/EGME)
// tu Vietcap. Endpoint KHONG CHINH THUC (reverse-engineer tu vnstock),
// cung rui ro nhu vci-listing-adapter.ts va vci-financials-adapter.ts da
// dung truoc do trong du an. LUON co fallback ve du lieu tinh khi loi.

const IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";

export interface VciEvent {
  eventCode: string;        // "DIV" | "ISS" | "AGME" | "AGMR" | "EGME" | ...
  publicDate: string | null;   // Ngay cong bo (ISO)
  exerciseDate: string | null; // Ngay GDKHQ (voi DIV) hoac ngay hop (voi AGME)
  eventTitle: string | null;
  ratio: string | null;        // Ty le co tuc (vd "10%" hoac "1000d/cp")
}

export interface DividendEventResult {
  ticker: string;
  available: boolean;
  exDividendEvents: VciEvent[];
  agmEvents: VciEvent[];
  error?: string;
}

function toDateStr(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Chuyen timestamp (ms hoac giay) VCI tra ve sang ISO date string. */
function parseVciTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return null;
  const ms = num > 1e12 ? num : num * 1000; // Phan biet giay vs mili-giay
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function fetchDividendEvents(ticker: string, monthsBack = 3, monthsForward = 6): Promise<DividendEventResult> {
  try {
    const now = new Date();
    const from = new Date(now); from.setMonth(from.getMonth() - monthsBack);
    const to = new Date(now); to.setMonth(to.getMonth() + monthsForward);

    const fromStr = from.toISOString().slice(0, 10).replace(/-/g, "");
    const toStr = to.toISOString().slice(0, 10).replace(/-/g, "");

    const url = `${IQ_BASE_URL}/v1/events?ticker=${ticker}&fromDate=${fromStr}&toDate=${toStr}&eventCode=DIV,ISS,AGME,AGMR,EGME&page=0&size=50`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ticker, available: false, exDividendEvents: [], agmEvents: [], error: `VCI HTTP ${res.status}` };
    }

    const json = await res.json();
    const rawEvents: any[] = json?.data?.content ?? (Array.isArray(json?.data) ? json.data : []);

    const events: VciEvent[] = rawEvents.map((e) => ({
      eventCode: e.eventCode ?? e.event_code ?? "",
      publicDate: parseVciTimestamp(e.publicDate ?? e.public_date),
      exerciseDate: parseVciTimestamp(e.exerciseDate ?? e.exercise_date ?? e.exerDate),
      eventTitle: e.eventTitle ?? e.event_title ?? e.eventTitleVi ?? null,
      ratio: e.ratio ?? e.exerciseRatio ?? null,
    }));

    return {
      ticker, available: true,
      exDividendEvents: events.filter((e) => e.eventCode === "DIV"),
      agmEvents: events.filter((e) => ["AGME", "AGMR", "EGME"].includes(e.eventCode)),
    };
  } catch (err) {
    return { ticker, available: false, exDividendEvents: [], agmEvents: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lay su kien cho nhieu ma song song, KHONG de 1 ma loi lam hong ca danh sach. */
export async function fetchDividendEventsBatch(tickers: string[]): Promise<DividendEventResult[]> {
  const results = await Promise.allSettled(tickers.map((t) => fetchDividendEvents(t)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ticker: tickers[i], available: false, exDividendEvents: [], agmEvents: [], error: "Promise rejected" }
  );
}
