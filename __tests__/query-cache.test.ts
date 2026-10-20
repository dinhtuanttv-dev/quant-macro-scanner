// D3 (2026-10-20): đệm kết quả truy vấn Prisma — kiểm tra SONG SINH với đọc thẳng qua nhiều tiến trình, ghi xen kẽ,
// đọc song song với ghi, giữ kiểu Date, KV lỗi.
import { describe, expect, it } from "vitest";
import { createQueryCache, decodeValue, encodeValue, relationClosure, type Kv } from "@/lib/read-model/query-cache";

function fakeKv() {
  const m = new Map<string, unknown>();
  let commands = 0;
  let fail = false;
  const kv: Kv & { m: Map<string, unknown>; commands: () => number; setFail: (f: boolean) => void } = {
    m,
    commands: () => commands,
    setFail: (f) => { fail = f; },
    async mget<T extends unknown[]>(...keys: string[]) { commands++; if (fail) throw new Error("kv down"); return keys.map((k) => m.get(k) ?? null) as T; },
    async get<T>(k: string) { commands++; if (fail) throw new Error("kv down"); return (m.get(k) ?? null) as T | null; },
    async set(k: string, v: unknown) { commands++; if (fail) throw new Error("kv down"); m.set(k, JSON.parse(JSON.stringify(v))); return "OK"; },
    pipeline() {
      const ops: (() => void)[] = [];
      const p = {
        incr: (k: string) => { ops.push(() => m.set(k, Number(m.get(k) ?? 0) + 1)); return p; },
        decr: (k: string) => { ops.push(() => m.set(k, Number(m.get(k) ?? 0) - 1)); return p; },
        expire: () => { ops.push(() => {}); return p; },
        async exec() { commands += ops.length; if (fail) throw new Error("kv down"); ops.forEach((o) => o()); return []; },
      };
      return p;
    },
  };
  return kv;
}

const DMMF = { datamodel: { models: [
  { name: "A", fields: [{ kind: "scalar", type: "String" }] },
  { name: "Src", fields: [{ kind: "object", type: "Ref" }] },
  { name: "Ref", fields: [{ kind: "object", type: "Src" }] },
  { name: "B", fields: [] },
] } };

const tick = (ms = 0) => new Promise((r) => (ms ? setTimeout(r, ms) : setImmediate(r)));

describe("query-cache", () => {
  it("mã hoá giữ kiểu Date (kể cả lồng nhau); NaN / BigInt -> không mã hoá (bỏ đệm)", () => {
    const v = { a: new Date("2026-10-20T01:02:03.004Z"), list: [{ d: new Date(0), x: 1.5, s: "t" }], n: null, j: { __x: 1 } };
    const back = decodeValue<typeof v>(encodeValue(v));
    expect(back).toEqual(v);
    expect(back.a).toBeInstanceOf(Date);
    expect(back.list[0].d).toBeInstanceOf(Date);
    expect(() => encodeValue({ x: NaN })).toThrow();
    expect(() => encodeValue({ x: BigInt(1) })).toThrow();
  });

  it("bao đóng quan hệ theo DMMF", () => {
    const c = relationClosure(DMMF);
    expect(c.get("Src")).toEqual(["Ref", "Src"]);
    expect(c.get("A")).toEqual(["A"]);
  });

  it("song sinh: 3 tiến trình, 3000 thao tác đọc/ghi ngẫu nhiên — đọc qua đệm luôn bằng đọc thẳng", async () => {
    const kv = fakeKv();
    const db = {
      A: new Map<number, object>(), B: new Map<number, object>(), Src: new Map<number, object>(), Ref: new Map<number, object>(),
    };
    let seed = 42;
    const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const pending: Promise<unknown>[] = [];
    const caches = [0, 1, 2].map(() => createQueryCache({ kv, dmmf: DMMF, releaseMs: 2, runAfter: (p) => { pending.push(p); return true; }, log: { warn() {} } }));
    const models = ["A", "B", "Src", "Ref"] as const;
    const readFn = (model: (typeof models)[number], q: number) => async () => {
      await tick(0);
      const rows = [...db[model].entries()].filter(([id]) => id % 3 === q).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      return model === "Src" ? { rows, refs: db.Ref.size } : rows; // Src "include" Ref
    };
    let reads = 0, hits = 0;
    for (let i = 0; i < 3000; i++) {
      const qc = caches[Math.floor(r() * 3)];
      const model = models[Math.floor(r() * 4)];
      if (r() < 0.2) {
        const id = Math.floor(r() * 30);
        await qc.write([...qc.depsOf(model), qc.ANY], async () => {
          await tick(0);
          db[model].set(id, model === "A" ? { id, v: r(), at: new Date(Math.floor(r() * 1e12)) } : { id, v: r() });
        });
        if (r() < 0.5) await Promise.all(pending.splice(0)); // đôi khi đợt ghi đã nhả khoá trước lượt đọc sau
        continue;
      }
      const q = Math.floor(r() * 3);
      const before = qc.stats();
      const got = await qc.read(qc.depsOf(model), { m: model, o: "findMany", a: { q } }, readFn(model, q));
      const want = await readFn(model, q)();
      expect(got).toEqual(want);
      reads++;
      const after = qc.stats();
      if (after.l1Hits + after.l2Hits > before.l1Hits + before.l2Hits) hits++;
    }
    await Promise.all(pending.splice(0));
    expect(reads).toBeGreaterThan(2000);
    expect(hits / reads).toBeGreaterThan(0.3);
  }, 120_000);

  it("đọc trong lúc đang ghi (khoá) -> đọc thẳng, không lưu đệm; sau khi nhả khoá đệm lại dữ liệu mới", async () => {
    const kv = fakeKv();
    const pending: Promise<unknown>[] = [];
    const writer = createQueryCache({ kv, releaseMs: 2, runAfter: (p) => { pending.push(p); return true; } });
    const reader = createQueryCache({ kv, releaseMs: 2 });
    let value = 1;
    const run = async () => value;
    expect(await reader.read(["A"], "k", run)).toBe(1);
    expect(await reader.read(["A"], "k", run)).toBe(1);
    let release!: () => void;
    const w = writer.write(["A", writer.ANY], () => new Promise<void>((res) => { release = () => { value = 2; res(); }; }));
    await tick(1);
    expect(await reader.read(["A"], "k", run)).toBe(1); // DB chưa đổi; khoá -> đọc thẳng
    expect(reader.stats().bypassLocked).toBe(1);
    release();
    await w;
    expect(await reader.read(["A"], "k", run)).toBe(2); // còn khoá tới khi đợt ghi lặng -> đọc thẳng
    await Promise.all(pending);
    expect(await reader.read(["A"], "k", run)).toBe(2);
    value = 3; // đổi "ngoài" không qua write: lần đọc này phải là bản đệm (2) -> chứng minh đệm hoạt động sau khi nhả khoá
    expect(await reader.read(["A"], "k", run)).toBe(2);
  });

  it("lượt đọc bắt đầu trước khi ghi nhưng xong sau ghi không được dùng làm đệm", async () => {
    const kv = fakeKv();
    const pending: Promise<unknown>[] = [];
    const qc = createQueryCache({ kv, releaseMs: 1, runAfter: (p) => { pending.push(p); return true; } });
    let value = 1;
    let go!: () => void;
    const slowRead = qc.read(["A"], "k", () => new Promise<number>((res) => { go = () => res(value); }));
    await tick(1);
    await qc.write(["A", qc.ANY], async () => { value = 2; });
    await Promise.all(pending.splice(0));
    go();
    expect(await slowRead).toBe(2);
    expect(await qc.read(["A"], "k", async () => value)).toBe(2); // không trả bản "1" nào
    value = 3;
    expect(await qc.read(["A"], "k", async () => value)).toBe(2); // bản đệm hợp lệ (đọc sau ghi)
  });

  it("ghi khi KV lỗi: vẫn ghi; đọc thẳng; RAW tăng khi KV hồi phục -> bản đệm cũ bị bỏ", async () => {
    const kv = fakeKv();
    const qc = createQueryCache({ kv, releaseMs: 1, runAfter: () => false, log: { warn() {} } });
    let value = 1;
    expect(await qc.read(["A"], "k", async () => value)).toBe(1);
    kv.setFail(true);
    await qc.write(["A", qc.ANY], async () => { value = 2; });
    expect(await qc.read(["A"], "k", async () => value)).toBe(2);
    kv.setFail(false);
    await qc.invalidateAll(); // thao tác vận hành sau sự cố KV (route admin)
    expect(await qc.read(["A"], "k", async () => value)).toBe(2);
  });

  it("đợt ghi dài: một khoá cho cả đợt, nhả một lần (ít lệnh KV)", async () => {
    const kv = fakeKv();
    const pending: Promise<unknown>[] = [];
    const qc = createQueryCache({ kv, releaseMs: 5, runAfter: (p) => { pending.push(p); return true; } });
    const c0 = kv.commands();
    for (let i = 0; i < 200; i++) await qc.write(["A", qc.ANY], async () => {});
    await Promise.all(pending);
    await tick(10);
    expect(kv.commands() - c0).toBeLessThan(20);
    expect(Number(kv.m.get("qc:l:A"))).toBe(0);
  });
  it("tiến trình ghi chết trước khi nhả khoá: khoá hết hạn, bản đệm từ TRƯỚC lần ghi không được dùng lại", async () => {
    const kv = fakeKv();
    const reader = createQueryCache({ kv, releaseMs: 1 });
    const crashed = createQueryCache({ kv, releaseMs: 1e9, runAfter: () => true }); // không bao giờ nhả
    let value = 1;
    expect(await reader.read(["A"], "k", async () => value)).toBe(1);
    await crashed.write(["A", crashed.ANY], async () => { value = 2; });
    kv.m.set("qc:l:A", 0); // khoá tự hết hạn (EXPIRE) sau khi tiến trình chết
    kv.m.set("qc:l:$any", 0);
    expect(await reader.read(["A"], "k", async () => value)).toBe(2);
  });
});
