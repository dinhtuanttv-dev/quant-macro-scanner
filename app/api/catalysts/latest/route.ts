// 31/10/2026: snapshot Chất xúc tác nằm trên Market Gateway (GET /api/catalysts/latest). Route này chuyển tiếp cho trang scanner của Project A;
// giữ hợp đồng cũ: { error } khi chưa có dữ liệu, 503 + transient khi nguồn tạm lỗi.
import { NextResponse } from "next/server";
import { MARKET_GATEWAY_URL } from "@/lib/market-data/ssi-gateway-adapter";
import { withCdnCache } from "@/lib/http/cdnCache";

async function getUncached() {
  try {
    const res = await fetch(`${MARKET_GATEWAY_URL}/api/catalysts/latest`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (err) {
    console.error("[api/catalysts/latest] Gateway loi:", err);
    return NextResponse.json({ error: "Dich vu du lieu tam thoi gian doan - vui long thu lai sau it phut.", transient: true }, { status: 503 });
  }
}

/** CDN của Vercel trả lượt gọi lặp lại trong 900 giây (giảm CPU Fluid Active — hạn mức miễn phí). */
export const GET = withCdnCache(getUncached, 900);
