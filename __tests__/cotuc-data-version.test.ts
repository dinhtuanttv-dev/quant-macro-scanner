import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __setCotucKv, __setCotucStoreStamp, bumpCotucDataVersion, COTUC_VERSION_KEY, getCotucDataVersion, readThroughByVersion } from "@/lib/cotuc/data-version";

function memKv() {
  const m = new Map<string, unknown>();
  const kv = {
    sets: 0,
    get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : null),
    set: async (k: string, v: unknown) => { kv.sets++; m.set(k, JSON.parse(JSON.stringify(v))); return "OK"; },
  };
  return { kv, m };
}

let stamp: string | null = "decision:2026-10-30T00:00:00Z";
beforeEach(() => { stamp = "decision:2026-10-30T00:00:00Z"; __setCotucStoreStamp(async () => stamp); });
afterEach(() => { __setCotucKv(undefined); __setCotucStoreStamp(undefined); });

describe("N2 — đọc Cổ tức qua KV theo phiên bản dữ liệu", () => {
  it("cùng phiên bản -> chỉ tính (đọc Neon) một lần; phiên bản mới -> tính lại; kết quả giống hệt", async () => {
    const { kv } = memKv();
    __setCotucKv(kv as never);
    await bumpCotucDataVersion(1);
    let calls = 0;
    const compute = async () => { calls++; return { asOf: "2026-10-16", rows: [{ t: "FPT", x: 1 }] }; };
    const a = await readThroughByVersion("timing-signals", compute);
    const b = await readThroughByVersion("timing-signals", compute);
    expect(calls).toBe(1);
    expect(b).toEqual(a);
    await bumpCotucDataVersion(2);
    await readThroughByVersion("timing-signals", compute);
    expect(calls).toBe(2);
    expect(await getCotucDataVersion()).toMatch(/^2-/);
  });

  it("chưa có phiên bản hoặc không có KV -> tính trực tiếp như cũ; KV lỗi không làm hỏng route", async () => {
    const { kv } = memKv();
    __setCotucKv(kv as never);
    let calls = 0;
    const compute = async () => ++calls;
    await readThroughByVersion("x", compute);
    await readThroughByVersion("x", compute);
    expect(calls).toBe(2);
    expect(kv.sets).toBe(0);

    __setCotucKv(null);
    expect(await readThroughByVersion("x", compute)).toBe(3);
    expect(await bumpCotucDataVersion()).toBeNull();

    __setCotucKv({ get: async () => { throw new Error("down"); }, set: async () => { throw new Error("down"); } } as never);
    expect(await getCotucDataVersion()).toBeNull();
    expect(await readThroughByVersion("x", compute)).toBe(4);
  });

  it("Vercel CPU giai đoạn 2: job trên Gateway ghi kho (không tăng KV) -> dấu ghi đổi -> tính lại; không đọc được dấu ghi -> tính trực tiếp", async () => {
    const { kv } = memKv();
    __setCotucKv(kv as never);
    await bumpCotucDataVersion(1);
    let calls = 0;
    const compute = async () => ++calls;
    await readThroughByVersion("timing-signals", compute);
    await readThroughByVersion("timing-signals", compute);
    expect(calls).toBe(1);
    stamp = "decision:2026-10-30T09:00:00Z"; // Gateway vừa ghi
    __setCotucStoreStamp(async () => stamp); // bỏ đệm 10 giây của dấu ghi
    await readThroughByVersion("timing-signals", compute);
    expect(calls).toBe(2);
    __setCotucStoreStamp(async () => null);
    await readThroughByVersion("timing-signals", compute);
    await readThroughByVersion("timing-signals", compute);
    expect(calls).toBe(4);
    expect(await getCotucDataVersion()).toBeNull();
  });

  it("khoá phiên bản dùng chung một tên cố định", () => {
    expect(COTUC_VERSION_KEY).toBe("cotuc:data-version");
  });
});
