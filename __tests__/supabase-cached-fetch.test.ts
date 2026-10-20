// D3 (2026-10-20): supabase-js THẬT qua fetch có đệm == supabase-js đọc thẳng (PostgREST giả lập), xen kẽ ghi.
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCachedSupabaseFetch } from "@/lib/read-model/supabase-fetch";
import { createQueryCache, type Kv } from "@/lib/read-model/query-cache";

function fakeKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    async mget<T extends unknown[]>(...keys: string[]) { return keys.map((k) => m.get(k) ?? null) as T; },
    async get<T>(k: string) { return (m.get(k) ?? null) as T | null; },
    async set(k: string, v: unknown) { m.set(k, JSON.parse(JSON.stringify(v))); return "OK"; },
    pipeline() {
      const ops: (() => void)[] = [];
      const p = {
        incr: (k: string) => { ops.push(() => m.set(k, Number(m.get(k) ?? 0) + 1)); return p; },
        decr: (k: string) => { ops.push(() => m.set(k, Number(m.get(k) ?? 0) - 1)); return p; },
        expire: () => { ops.push(() => {}); return p; },
        async exec() { ops.forEach((o) => o()); return []; },
      };
      return p;
    },
  };
}

function fakePostgrest() {
  const tables = new Map<string, Record<string, unknown>[]>();
  let gets = 0;
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const table = u.pathname.split("/rest/v1/")[1];
    const method = (init.method ?? "GET").toUpperCase();
    const rows = tables.get(table) ?? [];
    tables.set(table, rows);
    const filters = [...u.searchParams.entries()].filter(([k]) => !["select", "order", "limit", "on_conflict", "columns"].includes(k));
    const match = (r: Record<string, unknown>) => filters.every(([k, v]) => {
      const [op, ...rest] = v.split("."); const val = rest.join(".");
      if (op === "eq") return String(r[k]) === val;
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").includes(String(r[k]));
      if (op === "gte") return String(r[k]) >= val;
      return true;
    });
    if (method === "POST") {
      const body = JSON.parse(String(init.body));
      for (const row of Array.isArray(body) ? body : [body]) {
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row });
      }
      return new Response(null, { status: 201 });
    }
    if (method === "DELETE") {
      tables.set(table, rows.filter((r) => !match(r)));
      return new Response(null, { status: 204 });
    }
    gets++;
    let out = rows.filter(match);
    const order = u.searchParams.get("order");
    if (order) { const [col, dir] = order.split("."); out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (dir === "desc" ? -1 : 1)); }
    const limit = Number(u.searchParams.get("limit") || 0);
    if (limit) out = out.slice(0, limit);
    const sel = u.searchParams.get("select");
    if (sel && sel !== "*") out = out.map((r) => Object.fromEntries(sel.split(",").map((c) => [c.trim(), r[c.trim()]])));
    const accept = new Headers(init.headers).get("accept") ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      if (out.length !== 1) return new Response(JSON.stringify({ code: "PGRST116", message: "not one" }), { status: 406, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(out[0]), { status: 200, headers: { "content-type": "application/vnd.pgrst.object+json" } });
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json", "content-range": `0-${out.length - 1}/*` } });
  };
  return { fetchImpl, gets: () => gets };
}

describe("supabase-js qua fetch có đệm", () => {
  it("song sinh 1500 thao tác: kết quả (data, error, status) giống hệt; ít lượt GET thật hơn", async () => {
    const fake = fakePostgrest();
    const pending: Promise<unknown>[] = [];
    const qc = createQueryCache({ kv: fakeKv(), releaseMs: 1, runAfter: (p) => { pending.push(p); return true; } });
    const direct = createClient("https://x.supabase.co", "k", { auth: { persistSession: false }, global: { fetch: fake.fetchImpl } });
    const cached = createClient("https://x.supabase.co", "k", { auth: { persistSession: false }, global: { fetch: createCachedSupabaseFetch(fake.fetchImpl, () => qc) } });
    let seed = 9;
    const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const T = ["world_macro_trends", "world_market_pulse", "monthly_commodity_price"];
    const strip = (x: { data: unknown; error: unknown; status: number; count?: unknown }) => ({ data: x.data, error: x.error ? (x.error as { code?: string }).code ?? "err" : null, status: x.status });
    let directGets = 0;
    for (let i = 0; i < 1500; i++) {
      const t = T[Math.floor(r() * 3)];
      if (r() < 0.03) {
        const id = Math.floor(r() * 12);
        await cached.from(t).upsert({ id, v: r(), fetched_at: new Date(Math.floor(r() * 1e12)).toISOString(), k: id % 2 ? "A" : "B" });
        await new Promise((res) => setTimeout(res, 3)); // thời gian trôi: hẹn giờ nhả khoá chạy (như production)
        await Promise.all(pending.splice(0));
        continue;
      }
      if (r() < 0.03) { await cached.from(t).delete().in("id", [Math.floor(r() * 12)]); await new Promise((res) => setTimeout(res, 3)); await Promise.all(pending.splice(0)); continue; }
      const kind = Math.floor(r() * 4);
      const qid = String(Math.floor(r() * 12));
      const run = (c: typeof direct) =>
        kind === 0 ? c.from(t).select("*").order("fetched_at", { ascending: false }).limit(1).single()
          : kind === 1 ? c.from(t).select("*").order("fetched_at", { ascending: false }).limit(10)
            : kind === 2 ? c.from(t).select("id, v").in("k", ["A"]).order("id", { ascending: true })
              : c.from(t).select("v").eq("id", qid).maybeSingle();
      const g0 = fake.gets();
      const b = strip(await run(direct));
      directGets += fake.gets() - g0;
      const a = strip(await run(cached));
      expect(a).toEqual(b);
    }
    // ghi dày (~1/17 thao tác) vẫn giảm > 60% lượt GET; thực tế dữ liệu thế giới ghi 2 lần/ngày -> gần như mọi lượt đọc trúng đệm
    expect(fake.gets() - directGets).toBeLessThan(directGets * 0.4);
  }, 60_000);
});
