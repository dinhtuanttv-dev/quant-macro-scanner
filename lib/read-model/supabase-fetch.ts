// D3 (2026-10-20) — fetch có đệm cho supabase-js (project Supabase dữ liệu thế giới của Project A).
//
// Gói miễn phí Supabase tính 5 GB egress/tháng CHUNG cho cả tổ chức (cùng project của Gateway) — 10/2026 cả hai bị khoá 402.
// Mọi lệnh PostgREST của client service đi qua đây (createClient(..., { global: { fetch } })):
//   - GET/HEAD /rest/v1/<bảng>: đệm phản hồi 2xx theo phiên bản bảng (cùng giao thức query-cache.ts) -> dữ liệu chưa đổi thì
//     không đọc lại Supabase; phản hồi trả về giống hệt (thân, mã, content-type, content-range).
//   - POST/PATCH/PUT/DELETE: khoá + tăng phiên bản bảng trước, nhả + tăng sau.
//   - RPC / auth / realtime / storage: đi thẳng (RPC ghi -> vô hiệu hoá mọi bảng).
import { createQueryCache, kvFromEnv } from "./query-cache";

const ALL = "sb:*";
let cache: ReturnType<typeof createQueryCache> | null = null;
const qc = () => (cache ??= createQueryCache({ kv: kvFromEnv() }));

type Snap = { status: number; statusText: string; headers: Record<string, string>; body: string };
const KEEP_HEADERS = ["content-type", "content-range", "preference-applied"];

function headerPairs(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(h).forEach((v, k) => { if (!["apikey", "authorization", "x-client-info"].includes(k)) out[k] = v; });
  return out;
}

export function createCachedSupabaseFetch(base: typeof fetch = fetch, cacheFactory = qc): typeof fetch {
  return async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const m = /\/rest\/v1\/([^?/]+)(\/[^?]*)?(\?|$)/.exec(url);
    if (!m) return base(input, init);
    const table = decodeURIComponent(m[1]);
    const c = cacheFactory();
    if (table === "rpc") {
      if (method === "GET" || method === "HEAD") return base(input, init);
      return c.write([ALL], () => base(input, init));
    }
    const models = [`sb:${table}`, ALL];
    if (method === "GET" || method === "HEAD") {
      const snap = await c.read<Snap>(models, { sb: url, m: method, h: headerPairs(init.headers) }, async () => {
        const res = await base(input, init);
        const headers: Record<string, string> = {};
        for (const k of KEEP_HEADERS) { const v = res.headers.get(k); if (v !== null) headers[k] = v; }
        return { status: res.status, statusText: res.statusText, headers, body: method === "HEAD" ? "" : await res.text() };
      }, { cacheIf: (s) => (s.status >= 200 && s.status < 300) || s.status === 406 }); // 406 = không đúng 1 dòng (single/maybeSingle): do dữ liệu quyết định
      return new Response(method === "HEAD" || snap.status === 204 ? null : snap.body, { status: snap.status, statusText: snap.statusText, headers: snap.headers });
    }
    return c.write([`sb:${table}`], () => base(input, init)); // chỉ bảng này (sb:* chỉ tăng khi RPC ghi)
  };
}
