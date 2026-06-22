import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runMacroNewsFetch } from "@/lib/macro/fetcher";

/**
 * Route Handler dùng cho Vercel Cron (cấu hình trong vercel.json):
 *
 *   {
 *     "crons": [
 *       { "path": "/api/cron/macro-news", "schedule": "0 *\/4 * * *" }
 *     ]
 *   }
 *
 * "0 *\/4 * * *" = chạy vào phút 0 của mỗi 4 giờ (00:00, 04:00, 08:00, 12:00, 16:00, 20:00).
 *
 * BẢO MẬT: Vercel Cron tự động gửi header Authorization: Bearer ${CRON_SECRET}.
 * Set biến môi trường CRON_SECRET trên Vercel và verify ở đây để route không bị
 * gọi tùy ý từ bên ngoài.
 *
 * KHÔNG LÀM TREO APP: route này chạy độc lập trên serverless function riêng của
 * Vercel Cron, không nằm trong request path của user -> user không bị block dù
 * fetch RSS/scraping chậm. Để chắc chắn hơn, đặt maxDuration phù hợp (xem export config).
 */

export const maxDuration = 60; // giây — đủ cho vài request RSS/scrape; tăng nếu cần

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runMacroNewsFetch();

    // Sau khi có tin mới, revalidate các path liên quan để UI lấy data mới
    // mà KHÔNG cần rebuild toàn site (ISR on-demand revalidation).
    // Lưu ý: revalidateTag() đã đổi signature thành revalidateTag(tag, profile) ở các bản
    // Next.js có Cache Components — bỏ qua tag-based invalidation ở đây để tránh phụ thuộc
    // vào API đang thay đổi; revalidatePath theo đường dẫn cụ thể là đủ và ổn định hơn.
    revalidatePath("/macro-news");
    revalidatePath("/scanner"); // nếu trang scanner hiển thị tin vĩ mô kèm cổ phiếu

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[Cron:macro-news] Fetch failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}