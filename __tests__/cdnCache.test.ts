import { describe, expect, it } from "vitest";
import { withCdnCache } from "@/lib/http/cdnCache";

describe("withCdnCache — cache CDN cho API chỉ đọc", () => {
  it("gắn Vercel-CDN-Cache-Control cho phản hồi thành công", async () => {
    const get = withCdnCache(async () => Response.json({ ok: 1 }), 900);
    const res = await get();
    expect(res.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=900, stale-while-revalidate=86400");
    expect(await res.json()).toEqual({ ok: 1 });
  });
  it("lỗi 5xx (VD Neon hết hạn mức) giữ ngắn tối đa 120 giây, không stale; 4xx không giữ; giữ Cache-Control s-maxage route đã tự đặt; chuyển nguyên tham số", async () => {
    const err = await withCdnCache(async () => Response.json({ error: "x" }, { status: 500 }), 900)();
    expect(err.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=120");
    const errShort = await withCdnCache(async () => Response.json({ error: "x" }, { status: 503 }), 60)();
    expect(errShort.headers.get("Vercel-CDN-Cache-Control")).toBe("public, s-maxage=60");
    const notFound = await withCdnCache(async () => Response.json({ error: "x" }, { status: 404 }), 900)();
    expect(notFound.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
    const own = await withCdnCache(async () => Response.json({}, { headers: { "Cache-Control": "public, s-maxage=60" } }), 900)();
    expect(own.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
    const echo = withCdnCache(async (req: Request, ctx: { params: Promise<{ t: string }> }) => Response.json({ u: req.url, t: (await ctx.params).t }), 60);
    const r = await echo(new Request("https://x.test/api/a?ticker=FPT"), { params: Promise.resolve({ t: "FPT" }) });
    expect(await r.json()).toEqual({ u: "https://x.test/api/a?ticker=FPT", t: "FPT" });
  });
});
