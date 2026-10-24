// N2 (2026-10-17) — Phiên bản dữ liệu Cổ tức trong KV (Upstash) để phía ĐỌC không đánh thức Neon khi dữ liệu không đổi.
//
// Bối cảnh: Neon (Postgres của Prisma) tính hạn mức theo thời gian compute thức và chỉ ngủ sau 5 phút không có truy vấn.
// Thanh bên Elite Command Radar gọi /api/cotuc/buy-timeline mỗi phút trên MỌI tab, kèm các route Cổ tức khác, nên chỉ cần
// một người mở trang là Neon thức suốt -> hết hạn mức tháng 10/2026.
//
// Cơ chế: hai route GHI duy nhất của 4 bảng Cổ tức (cron timing-signals-scan, earnings-seasonality-scan) gọi
// bumpCotucDataVersion() sau mỗi lô. Route ĐỌC dùng readThroughByVersion(): cùng phiên bản -> trả kết quả đã tính lưu trong KV
// (giống hệt, vì cùng dữ liệu nguồn và cùng hàm tính); phiên bản mới -> tính lại từ Neon đúng một lần rồi lưu.
// Thiếu KV hoặc chưa có phiên bản -> tính trực tiếp như cũ (không bao giờ trả dữ liệu sai phiên bản).
import { Redis } from "@upstash/redis";

export const COTUC_VERSION_KEY = "cotuc:data-version";
const TTL_SEC = 2 * 24 * 3600;

type Kv = Pick<Redis, "get" | "set">;
let client: Kv | null | undefined;

function kv(): Kv | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

/** Chỉ dùng trong test. */
export function __setCotucKv(c: Kv | null | undefined) {
  client = c;
}

/** Gọi sau mỗi lô ghi dữ liệu Cổ tức (kể cả lô lỗi giữa chừng — có thể đã ghi một phần). Lỗi KV không làm hỏng cron. */
export async function bumpCotucDataVersion(now = Date.now()): Promise<string | null> {
  const c = kv();
  if (!c) return null;
  const v = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await c.set(COTUC_VERSION_KEY, v);
    return v;
  } catch {
    return null;
  }
}

export async function getCotucDataVersion(): Promise<string | null> {
  try {
    const v = await kv()?.get<string>(COTUC_VERSION_KEY);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

/**
 * Đọc qua KV theo phiên bản dữ liệu Cổ tức. `name` phải gồm MỌI tham số ảnh hưởng kết quả ngoài dữ liệu Neon
 * (VD ngày hôm nay, mã cổ phiếu). Kết quả quá lớn / KV lỗi -> vẫn trả kết quả tính trực tiếp.
 */
export async function readThroughByVersion<T>(name: string, compute: () => Promise<T>): Promise<T> {
  const c = kv();
  const v = c ? await getCotucDataVersion() : null;
  if (!c || !v) return compute();
  const key = `cotuc:rt:${name}:${v}`;
  try {
    const hit = await c.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch { /* đọc KV lỗi -> tính lại */ }
  const value = await compute();
  try {
    await c.set(key, value, { ex: TTL_SEC });
  } catch { /* quá giới hạn kích thước / KV lỗi -> bỏ qua đệm */ }
  return value;
}

// B1 (25/10/2026) — BẢN TỐT GẦN NHẤT (không hết hạn) cho các route quan trọng: lưu khi nội dung đổi, đọc khi nguồn dữ liệu tạm lỗi.
// Là bản sao thứ hai, độc lập với kho Cổ tức trên Gateway (Railway): Gateway sập vẫn còn bản trong Upstash.
const LAST_GOOD = (name: string) => `cotuc:lastgood:${name}`;
const savedHash = new Map<string, string>();

export async function saveLastGood(name: string, hash: string, value: unknown, now = Date.now()): Promise<boolean> {
  const c = kv();
  if (!c || savedHash.get(name) === hash) return false;
  try {
    await c.set(LAST_GOOD(name), { hash, savedAt: new Date(now).toISOString(), value });
    savedHash.set(name, hash);
    return true;
  } catch {
    return false;
  }
}

export async function readLastGood<T>(name: string): Promise<{ hash: string; savedAt: string; value: T } | null> {
  try {
    const v = await kv()?.get<{ hash: string; savedAt: string; value: T }>(LAST_GOOD(name));
    return v && typeof v === "object" && v.value ? v : null;
  } catch {
    return null;
  }
}
