// B2 (25/10/2026) — KHO CỔ TỨC trên Market Gateway (Railway Volume) thay CSDL Neon cho 5 bảng của tab Cổ tức:
//   decision = CotucDecisionState · timing = TimingSignalCache · season = EarningsSeasonalityCache · track = CotucSignalTrack
//   cycle = DividendCycleWindow · meta = dữ liệu phụ (danh mục + ngành cho Timeline)
// Lý do: Neon gói miễn phí hết hạn mức (Postgres 53000) vì các lượt quét giữ máy thức -> Timeline điểm mua sập. Neon chỉ là nơi LƯU
// (đầu vào đến từ SSI / VNDirect / Gateway), nên chỉ đổi chỗ đọc/ghi — engine, công thức và hợp đồng API giữ nguyên.
// Xác thực: Bearer CRON_SECRET (= PROJECT_A_CRON_SECRET bên Gateway, cùng bí mật Gateway dùng để gọi cron của Project A).
// Ghi = gộp theo cột (giống Prisma upsert/update). Cột thời gian về dạng chuỗi ISO -> các hàm `as*` đổi lại Date cho nơi dùng.
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";

export type CotucTable = "decision" | "timing" | "season" | "track" | "cycle" | "meta" | "sectortrack";

export class CotucStoreError extends Error {
  constructor(message: string, readonly status: number | null) { super(message); this.name = "CotucStoreError"; }
}

const TIMEOUT_MS = 20_000;
/** Kho mặc định nằm trên chính Market Gateway; COTUC_STORE_URL để tách riêng (VD thử tích hợp cục bộ). */
const storeBase = () => (process.env.COTUC_STORE_URL || MARKET_GATEWAY_URL).replace(/\/+$/, "");
/** Mỗi lượt ghi tối đa ~4 MB (Gateway nhận tối đa 15 MB). */
const MAX_BATCH_BYTES = 4_000_000;

function headers(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new CotucStoreError("Thiếu CRON_SECRET để truy cập kho Cổ tức trên Gateway.", null);
  return { authorization: `Bearer ${secret}`, accept: "application/json" };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${storeBase()}/api/cotuc-store${path}`, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new CotucStoreError(`Kho Cổ tức (Gateway) không phản hồi: ${e instanceof Error ? e.message : String(e)}`, null);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new CotucStoreError(`Kho Cổ tức (Gateway) ${res.status}: ${body?.error ?? "phản hồi rỗng"}`, res.status);
  return body;
}

export interface ListOptions { tickers?: string[]; keys?: string[]; fields?: string[] }

/** Đọc bảng (lọc theo mã / khoá, chiếu trường theo đường dẫn chấm — VD "snapshot.decision.level"). */
export async function storeList<T = Record<string, unknown>>(table: CotucTable, opts: ListOptions = {}): Promise<T[]> {
  const q = new URLSearchParams();
  if (opts.tickers) { if (!opts.tickers.length) return []; q.set("tickers", opts.tickers.join(",")); }
  if (opts.keys) { if (!opts.keys.length) return []; q.set("keys", opts.keys.join(",")); }
  if (opts.fields?.length) q.set("fields", opts.fields.join(","));
  const qs = q.toString();
  const body = await call<{ rows: T[] }>(`/${table}${qs ? `?${qs}` : ""}`);
  return body.rows;
}

/** Ghi gộp theo cột; tự chia lô theo dung lượng. Trả số dòng đã ghi. Lỗi -> ném (không báo thành công giả). */
export async function storeUpsert(table: CotucTable, rows: Record<string, unknown>[]): Promise<number> {
  let written = 0;
  let batch: string[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const r = await call<{ written: number }>(`/${table}`, { method: "POST", headers: { "content-type": "application/json" }, body: `{"rows":[${batch.join(",")}]}` });
    written += r.written;
    batch = []; bytes = 0;
  };
  for (const row of rows) {
    const s = JSON.stringify(row); // Date -> ISO; bỏ undefined (giống Prisma bỏ qua cột không gửi)
    if (bytes + s.length > MAX_BATCH_BYTES) await flush();
    batch.push(s); bytes += s.length;
  }
  await flush();
  return written;
}

/** Cột thời gian từ kho (chuỗi ISO) -> Date (giữ nguyên null). */
export const asDate = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
export function withDates<T extends Record<string, unknown>, K extends string>(row: T, cols: readonly K[]): T & Record<K, Date | null> {
  const out: Record<string, unknown> = { ...row };
  for (const c of cols) if (c in out) out[c] = asDate(out[c]);
  return out as T & Record<K, Date | null>;
}

/** Phân loại lỗi để route trả mã rõ ràng (B0) mà không lộ chi tiết nội bộ. */
export function cotucErrorCode(e: unknown): "STORE_UNAVAILABLE" | "DB_QUOTA" | "INTERNAL" {
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
  if (e instanceof CotucStoreError || (e as { name?: string })?.name === "CotucStoreError") return "STORE_UNAVAILABLE";
  if (/53000|exceeded the quota/i.test(msg)) return "DB_QUOTA";
  return "INTERNAL";
}

export interface StoreStatus { tables: Record<CotucTable, { rows: number; updatedAt: string | null; lightBytes: number }> }
export const storeStatus = () => call<StoreStatus>("/status");
