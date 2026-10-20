// D3 (2026-10-20) — đệm KẾT QUẢ TRUY VẤN Prisma trong Upstash để lượt xem trang không đánh thức Neon.
//
// Neon (gói miễn phí) tính hạn mức theo thời gian compute thức và chỉ ngủ sau 5 phút không có truy vấn: mỗi lượt xem trang
// đọc Neon giữ máy thức ≥ 5 phút. Lớp này nằm DƯỚI mọi route (Prisma client extension), nên logic route không đổi; chỉ khác
// nguồn của từng kết quả truy vấn:
//   - Đọc (findMany/findUnique/count/aggregate/groupBy/$queryRaw): chụp phiên bản các model phụ thuộc TRƯỚC khi truy vấn;
//     có bản đệm cùng phiên bản và không model nào đang bị ghi -> trả bản đệm (Neon không bị chạm); ngược lại đọc Neon.
//   - Ghi (create/update/upsert/delete/*Many/$executeRaw): lần ghi đầu của đợt -> TĂNG phiên bản + giữ khoá model; hết đợt ghi
//     (sau phản hồi, next/server after) -> tăng phiên bản lần nữa + nhả khoá. Đang có khoá -> mọi lượt đọc model đó đọc Neon
//     và KHÔNG lưu đệm. Nhờ vậy bản đệm luôn bằng đúng kết quả đọc thẳng tại cùng thời điểm.
//   - Phụ thuộc = model + mọi model nối quan hệ (bao đóng, theo DMMF) — thừa còn hơn thiếu.
//   - Mã hoá giữ kiểu (Date) để kết quả trả về y hệt kiểu Prisma.
// Không có KV (dev/test) hoặc KV lỗi -> đọc/ghi thẳng như cũ.
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { Redis } from "@upstash/redis";
import { after } from "next/server";

export type Kv = {
  mget<T extends unknown[]>(...keys: string[]): Promise<T>;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  pipeline(): { incr(k: string): unknown; decr(k: string): unknown; expire(k: string, s: number): unknown; exec(): Promise<unknown[]> };
};

const READ_OPS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
const ENTRY_TTL_SEC = 3 * 24 * 3600;
const LOCK_TTL_SEC = 600;
const REFRESH_MS = 60_000;
const MAX_L2_BYTES = 900_000; // Upstash: tối đa 1 MB mỗi lệnh
const L1_MAX_BYTES = 48 * 1024 * 1024;
// Dùng lại ảnh chụp phiên bản trong N ms (QUERY_CACHE_SNAPSHOT_MS) để giảm lệnh KV — MẶC ĐỊNH 0 = chính xác tuyệt đối
// (mỗi truy vấn 1 lệnh MGET). Bật > 0 chỉ khi lệnh Upstash gần trần: lần ghi của tiến trình KHÁC hiện ra chậm tối đa N ms.
const SNAPSHOT_MEMO_MS = Number(process.env.QUERY_CACHE_SNAPSHOT_MS) || 0;
const RAW = "$raw"; // ghi SQL thô: mọi bản đệm phụ thuộc
const ANY = "$any"; // mọi lần ghi: bản đệm của truy vấn SQL thô phụ thuộc

// ---------- mã hoá giữ kiểu ----------
const DATE_TAG = "__qcDate";
export function encodeValue(v: unknown): string {
  return JSON.stringify(v, function (this: Record<string, unknown>, k, val) {
    const raw = this[k];
    if (raw instanceof Date) return { [DATE_TAG]: Number.isNaN(raw.getTime()) ? null : raw.toISOString() };
    if (typeof raw === "bigint") throw new Error("bigint");
    if (typeof raw === "number" && !Number.isFinite(raw)) throw new Error("non-finite"); // JSON làm mất NaN/Infinity
    if (raw instanceof Uint8Array) throw new Error("bytes");
    return val;
  });
}
export function decodeValue<T>(s: string): T {
  return JSON.parse(s, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val) && DATE_TAG in val && Object.keys(val).length === 1) {
      return val[DATE_TAG] === null ? new Date(NaN) : new Date(val[DATE_TAG]);
    }
    return val;
  }) as T;
}

type Dmmf = { datamodel: { models: { name: string; fields: { kind: string; type: string }[] }[] } };
export function relationClosure(dmmf: Dmmf | undefined): Map<string, string[]> {
  const direct = new Map<string, Set<string>>();
  for (const m of dmmf?.datamodel.models ?? []) {
    direct.set(m.name, new Set(m.fields.filter((f) => f.kind === "object").map((f) => f.type)));
  }
  const out = new Map<string, string[]>();
  for (const name of direct.keys()) {
    const seen = new Set([name]);
    const stack = [name];
    while (stack.length) for (const n of direct.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    out.set(name, [...seen].sort());
  }
  return out;
}

export type QueryCacheStats = { l1Hits: number; l2Hits: number; misses: number; bypassLocked: number; skipped: number; writes: number; kvErrors: number; kvCommands: number };

export function createQueryCache({
  kv,
  dmmf,
  now = Date.now,
  runAfter = defaultAfter,
  log = console,
  releaseMs = 1_500,
}: {
  kv: Kv | null;
  dmmf?: Dmmf;
  now?: () => number;
  runAfter?: (p: Promise<unknown>) => boolean;
  log?: Pick<Console, "warn">;
  releaseMs?: number;
}) {
  const deps = relationClosure(dmmf);
  const depsOf = (model: string) => deps.get(model) ?? [model];
  const stats: QueryCacheStats = { l1Hits: 0, l2Hits: 0, misses: 0, bypassLocked: 0, skipped: 0, writes: 0, kvErrors: 0, kvCommands: 0 };
  const l1 = new Map<string, { stamp: string; body: string }>();
  let l1Bytes = 0;
  const instance = randomUUID().slice(0, 8);
  // Đợt ghi đang giữ khoá trong tiến trình này: model -> { holders, refreshedAt, release: Promise | null }
  const held = new Map<string, { writers: number; refreshedAt: number; releaseTimer: ReturnType<typeof setTimeout> | null; done: (() => void) | null }>();

  const vKey = (m: string) => `qc:v:${m}`;
  const lKey = (m: string) => `qc:l:${m}`;

  const snapMemo = new Map<string, { at: number; snap: { stamp: string; locked: boolean } }>();
  async function snapshot(models: string[]): Promise<{ stamp: string; locked: boolean } | null> {
    if (!kv) return null;
    const memoKey = models.join(",");
    const memo = snapMemo.get(memoKey);
    if (SNAPSHOT_MEMO_MS > 0 && memo && now() - memo.at < SNAPSHOT_MEMO_MS) return memo.snap;
    const keys = models.flatMap((m) => [vKey(m), lKey(m)]);
    try {
      stats.kvCommands += 1;
      const vals = await kv.mget<(string | number | null)[]>(...keys);
      let locked = false;
      const parts: string[] = [];
      for (let i = 0; i < models.length; i++) {
        parts.push(`${models[i]}=${vals[2 * i] ?? 0}`);
        if (Number(vals[2 * i + 1] ?? 0) > 0) locked = true;
      }
      const snap = { stamp: parts.join("|"), locked };
      if (SNAPSHOT_MEMO_MS > 0) {
        if (snapMemo.size > 500) snapMemo.clear();
        snapMemo.set(memoKey, { at: now(), snap });
      }
      return snap;
    } catch (e) {
      stats.kvErrors += 1;
      log.warn?.(`[query-cache] KV mget: ${(e as Error).message}`);
      return null;
    }
  }

  function l1Put(key: string, stamp: string, body: string) {
    const old = l1.get(key);
    if (old) { l1Bytes -= old.body.length; l1.delete(key); }
    l1.set(key, { stamp, body });
    l1Bytes += body.length;
    for (const [k, e] of l1) { if (l1Bytes <= L1_MAX_BYTES) break; l1.delete(k); l1Bytes -= e.body.length; }
  }

  /** Đọc qua đệm. models: các model kết quả phụ thuộc; keyParts: định danh truy vấn (model, thao tác, tham số). */
  async function read<T>(models: string[], keyParts: unknown, run: () => Promise<T>, { cacheIf = () => true }: { cacheIf?: (v: T) => boolean } = {}): Promise<T> {
    if (!kv) return run();
    let keyText: string;
    try { keyText = encodeValue(keyParts); } catch { stats.skipped += 1; return run(); }
    const key = `qc:e:${createHash("sha1").update(keyText).digest("hex")}`;
    const snap = await snapshot([...models, RAW]);
    if (!snap) return run();
    if (snap.locked) { stats.bypassLocked += 1; return run(); }
    const mem = l1.get(key);
    if (mem && mem.stamp === snap.stamp) { stats.l1Hits += 1; return decodeValue<T>(mem.body); }
    try {
      stats.kvCommands += 1;
      const hit = await kv.get<{ s: string; z?: string; b?: string }>(key);
      if (hit && hit.s === snap.stamp) {
        const body = hit.z ? gunzipSync(Buffer.from(hit.z, "base64")).toString("utf8") : String(hit.b);
        l1Put(key, snap.stamp, body);
        stats.l2Hits += 1;
        return decodeValue<T>(body);
      }
    } catch (e) {
      stats.kvErrors += 1;
      log.warn?.(`[query-cache] KV get: ${(e as Error).message}`);
    }
    stats.misses += 1;
    const value = await run();
    if (!cacheIf(value)) { stats.skipped += 1; return value; }
    let body: string;
    try { body = encodeValue(value); } catch { stats.skipped += 1; return value; }
    // Kết quả đã mã hoá -> giải mã lại để nơi gọi nhận ĐÚNG đối tượng giống lượt đệm (không chia sẻ tham chiếu).
    l1Put(key, snap.stamp, body);
    const entry = body.length > 4096 ? { s: snap.stamp, z: gzipSync(body).toString("base64") } : { s: snap.stamp, b: body };
    if ((entry.z ?? entry.b ?? "").length <= MAX_L2_BYTES) {
      try { stats.kvCommands += 1; await kv.set(key, entry, { ex: ENTRY_TTL_SEC }); } catch (e) { stats.kvErrors += 1; log.warn?.(`[query-cache] KV set: ${(e as Error).message}`); }
    } else stats.skipped += 1;
    return value;
  }

  async function pipe(fill: (p: ReturnType<Kv["pipeline"]>) => number) {
    if (!kv) return;
    const p = kv.pipeline();
    const n = fill(p);
    stats.kvCommands += n;
    await p.exec();
  }

  /** Bắt đầu ghi các model (gọi TRƯỚC lệnh ghi). Ném lỗi nếu KV lỗi -> lệnh ghi vẫn chạy nhưng đệm bị vô hiệu hoá toàn bộ. */
  async function beginWrite(models: string[]) {
    if (!kv) return;
    snapMemo.clear();
    const t = now();
    const need = models.filter((m) => {
      const h = held.get(m);
      return !h || t - h.refreshedAt > REFRESH_MS;
    });
    for (const m of models) {
      const h = held.get(m);
      if (h) {
        h.writers += 1;
        // Đợt ghi kéo dài: huỷ lần nhả đang chờ và kết thúc lời hứa after() cũ (lần endWrite kế tiếp đăng ký lời hứa mới).
        if (h.releaseTimer) { clearTimeout(h.releaseTimer); h.releaseTimer = null; h.done?.(); h.done = null; }
      }
    }
    if (!need.length) return;
    try {
      await pipe((p) => {
        let n = 0;
        for (const m of need) {
          const fresh = !held.has(m);
          p.incr(vKey(m)); n++;
          if (fresh) { p.incr(lKey(m)); n++; }
          p.expire(lKey(m), LOCK_TTL_SEC); n++;
        }
        return n;
      });
      for (const m of need) {
        const h = held.get(m);
        if (h) h.refreshedAt = t;
        else held.set(m, { writers: 1, refreshedAt: t, releaseTimer: null, done: null });
      }
      stats.writes += 1;
    } catch (e) {
      stats.kvErrors += 1;
      log.warn?.(`[query-cache] KV beginWrite: ${(e as Error).message}`);
      throw e;
    }
  }

  /** Kết thúc một lệnh ghi (gọi SAU lệnh ghi, kể cả lỗi). Nhả khoá khi đợt ghi lặng 1,5 s (giữ hàm sống bằng after()). */
  function endWrite(models: string[]) {
    if (!kv) return;
    for (const m of models) {
      const h = held.get(m);
      if (!h) continue;
      h.writers = Math.max(0, h.writers - 1);
      if (h.writers > 0) continue;
      const released = new Promise<void>((resolve) => {
        h.done = resolve;
        h.releaseTimer = setTimeout(() => {
          if (held.get(m) !== h || h.writers > 0) return resolve();
          held.delete(m);
          snapMemo.clear();
          pipe((p) => { p.incr(vKey(m)); p.decr(lKey(m)); return 2; })
            .catch((e) => { stats.kvErrors += 1; log.warn?.(`[query-cache] KV release ${m}: ${(e as Error).message}`); })
            .finally(resolve);
        }, releaseMs);
      });
      if (!runAfter(released)) {
        // Ngoài request (script): nhả ngay.
        if (h.releaseTimer) clearTimeout(h.releaseTimer);
        held.delete(m);
        void pipe((p) => { p.incr(vKey(m)); p.decr(lKey(m)); return 2; }).catch(() => {}).finally(() => h.done?.());
      }
    }
  }

  async function write<T>(models: string[], run: () => Promise<T>): Promise<T> {
    if (!kv) return run();
    try {
      await beginWrite(models);
    } catch {
      // KV lỗi: không chắc khoá được -> vẫn ghi (dữ liệu là ưu tiên), nhưng phải vô hiệu hoá đệm khi KV hồi phục:
      // mọi bản đệm phụ thuộc RAW -> lần đọc sau bỏ qua toàn bộ.
      try { return await run(); } finally { void pipe((p) => { p.incr(vKey(RAW)); return 1; }).catch(() => {}); }
    }
    try { return await run(); } finally { endWrite(models); }
  }

  return {
    read,
    write,
    depsOf,
    RAW, ANY,
    instance,
    stats: () => ({ ...stats, l1Entries: l1.size, l1Mb: Math.round((l1Bytes / 1048576) * 10) / 10, heldLocks: [...held.keys()] }),
    /** Vô hiệu hoá toàn bộ đệm (sau khi sửa Neon từ ngoài ứng dụng). */
    async invalidateAll() { await pipe((p) => { p.incr(vKey(RAW)); p.incr(vKey(ANY)); return 2; }); l1.clear(); l1Bytes = 0; snapMemo.clear(); },
  };
}

/** Giữ hàm serverless sống tới khi nhả khoá (next/server after); ngoài request (script, test) -> false. */
function defaultAfter(p: Promise<unknown>): boolean {
  try {
    after(() => p);
    return true;
  } catch {
    return false;
  }
}

export function kvFromEnv(): Kv | null {
  if (String(process.env.QUERY_CACHE ?? "on").toLowerCase() === "off") return null;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  return url && token ? (new Redis({ url, token, automaticDeserialization: true }) as unknown as Kv) : null;
}

export { READ_OPS, WRITE_OPS };
