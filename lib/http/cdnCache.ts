// Cache CDN cho các API CHỈ ĐỌC, công khai (30/10/2026 — đưa CPU Fluid Active về trong hạn mức miễn phí của Vercel).
// Lượt gọi lặp lại cùng URL được CDN của Vercel trả (không chạy hàm, không truy vấn DB) trong `seconds`; sau đó trả bản cũ trong lúc
// làm mới ngầm (`stale-while-revalidate`). Chỉ gắn cho phản hồi thành công và khi route chưa tự đặt Cache-Control.
type Handler<A extends unknown[]> = (...args: A) => Promise<Response> | Response;

export function withCdnCache<A extends unknown[]>(handler: Handler<A>, seconds: number, staleSeconds = 86_400): Handler<A> {
  return async (...args: A) => {
    const res = await handler(...args);
    try {
      if (res.ok && !res.headers.get("Cache-Control")?.includes("s-maxage") && !res.headers.has("Vercel-CDN-Cache-Control")) {
        res.headers.set("Vercel-CDN-Cache-Control", `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`);
      }
    } catch { /* header bất biến (stream / redirect) — giữ nguyên */ }
    return res;
  };
}
