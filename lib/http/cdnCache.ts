// Cache CDN cho các API CHỈ ĐỌC, công khai (30/10/2026 — đưa CPU Fluid Active về trong hạn mức miễn phí của Vercel).
// Lượt gọi lặp lại cùng URL được CDN của Vercel trả (không chạy hàm, không truy vấn DB) trong `seconds`; sau đó trả bản cũ trong lúc
// làm mới ngầm (`stale-while-revalidate`). Chỉ gắn khi route chưa tự đặt Cache-Control.
//
// Lỗi máy chủ (5xx) cũng được giữ NGẮN (tối đa ERROR_SECONDS, không có stale): khi Neon hết hạn mức (53000) mọi route đọc Neon trả 500
// — trước đây mỗi lượt trình duyệt vẫn chạy hàm và chờ Neon báo lỗi (~2 giây) -> tốn CPU Fluid vô ích. 4xx không giữ.
const ERROR_SECONDS = 120;

type Handler<A extends unknown[]> = (...args: A) => Promise<Response> | Response;

export function withCdnCache<A extends unknown[]>(handler: Handler<A>, seconds: number, staleSeconds = 86_400): Handler<A> {
  return async (...args: A) => {
    const res = await handler(...args);
    try {
      if (!res.headers.get("Cache-Control")?.includes("s-maxage") && !res.headers.has("Vercel-CDN-Cache-Control")) {
        if (res.ok) res.headers.set("Vercel-CDN-Cache-Control", `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`);
        else if (res.status >= 500) res.headers.set("Vercel-CDN-Cache-Control", `public, s-maxage=${Math.min(seconds, ERROR_SECONDS)}`);
      }
    } catch { /* header bất biến (stream / redirect) — giữ nguyên */ }
    return res;
  };
}
